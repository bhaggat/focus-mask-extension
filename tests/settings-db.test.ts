import { describe, expect, it } from 'vitest';
import {
  cleanName,
  deleteCustomSound,
  displayNameFromFile,
  getCustomSound,
  listCustomSounds,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS,
  putCustomSound,
  renameCustomSound,
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
    expect(s.pauseOnLock).toBe(true);
    expect(normalizeSettings({ pauseOnLock: false }).pauseOnLock).toBe(false);
  });
});

describe('upload validation', () => {
  const f = (name: string, type = '', size = 1000) => ({ name, type, size });
  it('accepts common audio formats by extension or mime', () => {
    for (const name of ['a.mp3', 'a.WAV', 'a.ogg', 'a.flac', 'a.m4a', 'a.opus', 'a.webm']) {
      expect(validateUpload(f(name), 0)).toBeNull();
    }
    expect(validateUpload(f('noext', 'audio/mpeg'), 0)).toBeNull();
    expect(validateUpload(f('noext', 'audio/x-m4a'), 0)).toBeNull();
  });
  it('rejects other formats, empty, oversized, and over the count limit', () => {
    expect(validateUpload(f('a.mid', 'audio/midi'), 0)).toMatch(/supported format/);
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

describe('renaming custom sounds', () => {
  it('cleans names', () => {
    expect(cleanName('  Rainy   day  ')).toBe('Rainy day');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(100))).toHaveLength(60);
  });

  it('renames in place, keeping the audio', async () => {
    const blob = new Blob([new Uint8Array([9])], { type: 'audio/mpeg' });
    await putCustomSound({ id: 'custom:r', name: 'old', type: 'audio/mpeg', size: 1, duration: 3, createdAt: 1, blob });
    expect(await renameCustomSound('custom:r', '  New  name ')).toBe('New name');
    const rec = await getCustomSound('custom:r');
    expect(rec?.name).toBe('New name');
    expect(rec).toMatchObject({ id: 'custom:r', duration: 3, size: 1, createdAt: 1 });
    expect(rec?.blob).toBeTruthy();
  });

  it('rejects empty names and missing sounds', async () => {
    await expect(renameCustomSound('custom:r', '  ')).rejects.toThrow(/empty/);
    await expect(renameCustomSound('custom:missing', 'x')).rejects.toThrow(/no longer exists/);
  });
});
