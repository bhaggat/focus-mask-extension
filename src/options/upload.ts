import {
  deleteCustomSound,
  displayNameFromFile,
  listCustomSounds,
  newCustomId,
  notifyCustomChanged,
  putCustomSound,
  renameCustomSound,
  UploadError,
  validateUpload,
} from '../shared/db';
import type { CustomSoundMeta } from '../shared/types';

/** Confirms the browser can actually decode the file and reads its duration. */
export function probeDuration(file: Blob, timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (fn: () => void) => {
      clearTimeout(timer);
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new UploadError('Timed out reading the file.'))), timeoutMs);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(() => resolve(Number.isFinite(el.duration) ? el.duration : 0));
    el.onerror = () => done(() => reject(new UploadError('This file couldn’t be decoded — it may be corrupt or use an unsupported codec.')));
    el.src = url;
  });
}

export async function addUploads(files: File[]): Promise<{ added: CustomSoundMeta[]; errors: string[] }> {
  const added: CustomSoundMeta[] = [];
  const errors: string[] = [];
  let count = (await listCustomSounds()).length;
  for (const file of files) {
    const err = validateUpload(file, count);
    if (err) {
      errors.push(err);
      continue;
    }
    try {
      const duration = await probeDuration(file);
      if (duration > 0 && duration < 1) throw new UploadError('is shorter than one second.');
      const rec = {
        id: newCustomId(),
        name: displayNameFromFile(file.name),
        type: file.type || 'audio/*',
        size: file.size,
        duration,
        createdAt: Date.now(),
        blob: file as Blob,
      };
      await putCustomSound(rec);
      const { blob: _b, ...meta } = rec;
      added.push(meta);
      count++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg.startsWith('is ') ? `"${file.name}" ${msg}` : `"${file.name}": ${msg}`);
    }
  }
  if (added.length) notifyCustomChanged();
  return { added, errors };
}

export async function removeUpload(id: string) {
  await deleteCustomSound(id);
  notifyCustomChanged();
  await chrome.runtime.sendMessage({ type: 'customDeleted', soundId: id });
}

export async function renameUpload(id: string, name: string): Promise<string> {
  const clean = await renameCustomSound(id, name);
  notifyCustomChanged();
  return clean;
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function formatDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
