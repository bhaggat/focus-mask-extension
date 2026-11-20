import type { PauseReason, RuntimeState } from './types';

/**
 * Pause is a set of reasons. Playback runs only when the set is empty.
 * - manual: sticky, cleared only by the user pressing play.
 * - auto-tab: derived from "another tab is audible" (+ setting, + override).
 * - break: active break window.
 */
export function pauseReasons(s: RuntimeState): PauseReason[] {
  const r: PauseReason[] = [];
  if (s.manual) r.push('manual');
  if (s.autoPause && s.tabAudible && !s.tabOverride) r.push('auto-tab');
  if (s.breakActive) r.push('break');
  return r;
}

export const isPlaying = (s: RuntimeState) => pauseReasons(s).length === 0;

export type StateEvent =
  /** audibleNow: raw (undebounced) reading, so play inside the debounce window still overrides. */
  | { type: 'play'; audibleNow?: boolean }
  | { type: 'pause'; audibleNow?: boolean }
  | { type: 'toggle'; audibleNow?: boolean }
  | { type: 'select'; soundId: string; play: boolean; audibleNow?: boolean }
  | { type: 'tabAudible'; audible: boolean }
  | { type: 'autoPause'; enabled: boolean }
  | { type: 'breakStart'; endsAt: number }
  | { type: 'breakEnd' }
  | { type: 'nextBreak'; at: number | null }
  | { type: 'error'; message: string };

export type Effect = { type: 'endBreakEarly' };

export interface Transition {
  state: RuntimeState;
  effects: Effect[];
}

export function initialState(soundId: string, autoPause: boolean): RuntimeState {
  return {
    soundId,
    manual: true,
    tabAudible: false,
    tabOverride: false,
    autoPause,
    breakActive: false,
    breakEndsAt: null,
    nextBreakAt: null,
    error: null,
  };
}

/** Pressing play expresses explicit intent: it clears every reason. */
function play(s: RuntimeState, audibleNow = false): Transition {
  const effects: Effect[] = [];
  const next = { ...s, manual: false, error: null };
  if ((s.tabAudible || audibleNow) && s.autoPause) next.tabOverride = true;
  if (s.breakActive) {
    next.breakActive = false;
    next.breakEndsAt = null;
    // Alarms/notification cleanup + scheduling the next break happen in the worker.
    effects.push({ type: 'endBreakEarly' });
  }
  return { state: next, effects };
}

export function reduce(s: RuntimeState, e: StateEvent): Transition {
  switch (e.type) {
    case 'play':
      return play(s, e.audibleNow);
    case 'pause':
      return { state: { ...s, manual: true }, effects: [] };
    case 'toggle':
      return isPlaying(s) ? reduce(s, { type: 'pause' }) : play(s, e.audibleNow);
    case 'select': {
      const withSound = { ...s, soundId: e.soundId };
      return e.play ? play(withSound, e.audibleNow) : { state: withSound, effects: [] };
    }
    case 'tabAudible':
      // Override lasts only for the current "something is audible" episode.
      return {
        state: { ...s, tabAudible: e.audible, tabOverride: e.audible ? s.tabOverride : false },
        effects: [],
      };
    case 'autoPause':
      return { state: { ...s, autoPause: e.enabled, tabOverride: false }, effects: [] };
    case 'breakStart':
      return { state: { ...s, breakActive: true, breakEndsAt: e.endsAt }, effects: [] };
    case 'breakEnd':
      return { state: { ...s, breakActive: false, breakEndsAt: null }, effects: [] };
    case 'nextBreak':
      return { state: { ...s, nextBreakAt: e.at }, effects: [] };
    case 'error':
      return { state: { ...s, manual: true, error: e.message }, effects: [] };
  }
}

export type StatusKind = 'playing' | 'paused' | 'auto-tab' | 'break';

/** Highest-priority explanation for the UI. */
export function statusKind(s: RuntimeState): StatusKind {
  const r = pauseReasons(s);
  if (r.length === 0) return 'playing';
  if (r.includes('break')) return 'break';
  if (r.includes('manual')) return 'paused';
  return 'auto-tab';
}
