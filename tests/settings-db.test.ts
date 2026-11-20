import { describe, expect, it } from 'vitest';
import {
  deleteCustomSound,
  displayNameFromFile,
  getCustomSound,
  listCustomSounds,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS,
  putCustomSound,
  validateUpload,
} from '../src/shared/db';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/settings';

describe('normalizeSettings', () => {
  it('fills defaults', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps and rejects garbage', () => {
    const s = normalizeSettings({ volume: 4, breakIntervalMin: 1, breakLengthMin: 999, autoPause: 'yes', soundId: '' });
    expect(s.volume).toBe(1);
    expect(s.breakIntervalMin).toBe(5);
    expect(s.breakLengthMin).toBe(60);
    expect(s.autoPause).toBe(true);
    expect(s.soundId).toBe('brown');
  });
});

describe('upload validation', () => {
  const f = (name: string, type = '', size = 1000) => ({ name, type, size });
  it('accepts mp3/wav/ogg by extension or mime', () => {
    expect(validateUpload(f('a.mp3'), 0)).toBeNull();
    expect(validateUpload(f('a.WAV'), 0)).toBeNull();
    expect(validateUpload(f('a.ogg'), 0)).toBeNull();
    expect(validateUpload(f('noext', 'audio/mpeg'), 0)).toBeNull();
  });
  it('rejects other formats, empty, oversized, and over the count limit', () => {
    expect(validateUpload(f('a.flac', 'audio/flac'), 0)).toMatch(/supported format/);
    expect(validateUpload(f('a.pdf', 'application/pdf'), 0)).toMatch(/supported format/);
    expect(validateUpload(f('a.mp3', '', 0), 0)).toMatch(/empty/);
    expect(validateUpload(f('a.mp3', '', MAX_UPLOAD_BYTES + 1), 0)).toMatch(/limit/);
    expect(validateUpload(f('a.mp3'), MAX_UPLOADS)).toMatch(/up to/);
  });
  it('derives a display name', () => {
    expect(displayNameFromFile('my_cafe-loop.mp3')).toBe('my cafe loop');
    expect(displayNameFromFile('.mp3')).toBe('Untitled');
  });
});

describe('IndexedDB store', () => {
  it('round-trips, lists without blobs, and deletes', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });
    await putCustomSound({ id: 'custom:b', name: 'B', type: 'audio/mpeg', size: 3, duration: 5, createdAt: 2, blob });
    await putCustomSound({ id: 'custom:a', name: 'A', type: 'audio/mpeg', size: 3, duration: 5, createdAt: 1, blob });
    const list = await listCustomSounds();
    expect(list.map((x) => x.id)).toEqual(['custom:a', 'custom:b']);
    expect(list[0]).not.toHaveProperty('blob');
    expect((await getCustomSound('custom:a'))?.name).toBe('A');
    await deleteCustomSound('custom:a');
    expect(await getCustomSound('custom:a')).toBeUndefined();
  });
});
