export type SoundGroup = 'noise' | 'nature' | 'custom';

export interface SoundDef {
  id: string;
  name: string;
  group: SoundGroup;
  blurb: string;
}

export const BUILTIN_SOUNDS: SoundDef[] = [
  { id: 'brown', name: 'Brown noise', group: 'noise', blurb: 'Deep, soft rumble. Best for masking voices.' },
  { id: 'pink', name: 'Pink noise', group: 'noise', blurb: 'Balanced and natural, like steady rainfall.' },
  { id: 'white', name: 'White noise', group: 'noise', blurb: 'Bright, full-spectrum hiss.' },
  { id: 'rain', name: 'Rain', group: 'nature', blurb: 'Steady rain with soft droplets.' },
  { id: 'ocean', name: 'Ocean', group: 'nature', blurb: 'Slow waves rolling onto a beach.' },
  { id: 'stream', name: 'Stream', group: 'nature', blurb: 'A babbling creek.' },
  { id: 'fireplace', name: 'Fireplace', group: 'nature', blurb: 'Low fire with gentle crackles.' },
  { id: 'forest', name: 'Forest', group: 'nature', blurb: 'Wind in the trees and distant birds.' },
];

export const DEFAULT_SOUND_ID = 'brown';
export const CUSTOM_PREFIX = 'custom:';

export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);
export const isBuiltinId = (id: string) => BUILTIN_SOUNDS.some((s) => s.id === id);
export const builtinById = (id: string) => BUILTIN_SOUNDS.find((s) => s.id === id);

/** User-facing name for any sound id; custom names come from the caller's list. */
export function soundDisplayName(id: string, custom: { id: string; name: string }[]): string {
  return builtinById(id)?.name ?? custom.find((c) => c.id === id)?.name ?? 'Custom sound';
}
