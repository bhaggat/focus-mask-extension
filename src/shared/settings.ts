import { DEFAULT_SOUND_ID } from './sounds';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  soundId: DEFAULT_SOUND_ID,
  volume: 0.5,
  autoPause: true,
  breakEnabled: false,
  breakIntervalMin: 50,
  breakLengthMin: 5,
  onboarded: false,
};

export const BREAK_INTERVAL_LIMITS = { min: 5, max: 240 };
export const BREAK_LENGTH_LIMITS = { min: 1, max: 60 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Coerce anything read from storage into a valid Settings object. */
export function normalizeSettings(raw: Partial<Record<keyof Settings, unknown>> | undefined): Settings {
  const r = raw ?? {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    soundId: typeof r.soundId === 'string' && r.soundId ? r.soundId : DEFAULT_SETTINGS.soundId,
    volume: clamp(num(r.volume, DEFAULT_SETTINGS.volume), 0, 1),
    autoPause: bool(r.autoPause, DEFAULT_SETTINGS.autoPause),
    breakEnabled: bool(r.breakEnabled, DEFAULT_SETTINGS.breakEnabled),
    breakIntervalMin: Math.round(
      clamp(num(r.breakIntervalMin, DEFAULT_SETTINGS.breakIntervalMin), BREAK_INTERVAL_LIMITS.min, BREAK_INTERVAL_LIMITS.max),
    ),
    breakLengthMin: Math.round(
      clamp(num(r.breakLengthMin, DEFAULT_SETTINGS.breakLengthMin), BREAK_LENGTH_LIMITS.min, BREAK_LENGTH_LIMITS.max),
    ),
    onboarded: bool(r.onboarded, DEFAULT_SETTINGS.onboarded),
  };
}

export async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  return normalizeSettings(raw as Partial<Settings>);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set(next);
  return next;
}
