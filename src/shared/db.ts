import { CUSTOM_PREFIX } from './sounds';
import type { CustomSoundMeta, CustomSoundRecord } from './types';

const DB_NAME = 'focusmask';
const STORE = 'sounds';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOADS = 30;
// Anything Chrome can decode; probeDuration() still rejects files this build can't play
// (e.g. AAC on Chromium builds without proprietary codecs).
const ALLOWED_EXT = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'webm'];
const ALLOWED_MIME = [
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
  'audio/ogg', 'audio/opus', 'audio/webm',
  'audio/flac', 'audio/x-flac',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
];
export const UPLOAD_ACCEPT = [...ALLOWED_EXT.map((e) => `.${e}`), ...ALLOWED_MIME].join(',');
export const UPLOAD_FORMATS_LABEL = 'MP3, WAV, OGG, FLAC or M4A';

export class UploadError extends Error {}

/** Cheap checks before we try to decode. Returns a user-facing error or null. */
export function validateUpload(file: { name: string; type: string; size: number }, existingCount: number): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = file.type ? ALLOWED_MIME.includes(file.type) : false;
  if (!ALLOWED_EXT.includes(ext) && !typeOk) {
    return `"${file.name}" isn't a supported format. Use ${UPLOAD_FORMATS_LABEL}.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1048576} MB per file.`;
  }
  if (existingCount >= MAX_UPLOADS) return `You can keep up to ${MAX_UPLOADS} custom sounds. Delete one first.`;
  return null;
}

export const MAX_NAME_LENGTH = 60;

export function displayNameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return (base || 'Untitled').slice(0, MAX_NAME_LENGTH);
}

/** Collapse whitespace and cap length; returns null if nothing usable is left. */
export function cleanName(name: string): string | null {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return n || null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error);
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
      }),
  );
}

export function newCustomId(): string {
  return CUSTOM_PREFIX + crypto.randomUUID();
}

export const putCustomSound = (rec: CustomSoundRecord) => tx('readwrite', (s) => s.put(rec)).then(() => rec);
export const getCustomSound = (id: string) =>
  tx<CustomSoundRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<CustomSoundRecord | undefined>);
export const deleteCustomSound = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);

export async function renameCustomSound(id: string, name: string): Promise<string> {
  const clean = cleanName(name);
  if (!clean) throw new UploadError('Name can’t be empty.');
  const rec = await getCustomSound(id);
  if (!rec) throw new UploadError('This sound no longer exists.');
  if (rec.name !== clean) await putCustomSound({ ...rec, name: clean });
  return clean;
}

export async function listCustomSounds(): Promise<CustomSoundMeta[]> {
  const all = await tx<CustomSoundRecord[]>('readonly', (s) => s.getAll() as IDBRequest<CustomSoundRecord[]>);
  return all
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Broadcast channel so popup/options refresh their lists after changes. */
export const CUSTOM_CHANNEL = 'focusmask-custom-sounds';
export function notifyCustomChanged() {
  const ch = new BroadcastChannel(CUSTOM_CHANNEL);
  ch.postMessage('changed');
  ch.close();
}
