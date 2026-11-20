import type { ChimeKind, Countdown, PauseReason, RuntimeState } from './types';

/**
 * Pause is a set of reasons. Playback runs only when the set is empty.
 * - manual: sticky, cleared only by the user pressing play.
 * - auto-tab: derived from "another tab is audible" (+ setting, + override).
 * - away: screen is locked (+ setting). Clears itself on unlock.
 * - break: active break window.
 * The sleep timer is not a reason: when it fires it sets `manual`.
 */
export function pauseReasons(s: RuntimeState): PauseReason[] {
  const r: PauseReason[] = [];
  if (s.manual) r.push('manual');
  if (s.autoPause && s.tabAudible && !s.tabOverride) r.push('auto-tab');
  if (s.lockPause && s.screenLocked) r.push('away');
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
  | { type: 'screenLocked'; locked: boolean }
  | { type: 'lockPause'; enabled: boolean }
  | { type: 'sleepTimer'; endsAt: number | null; minutes: number | null }
  | { type: 'sleepTimerFired' }
  | { type: 'error'; message: string }
  | { type: 'countdown'; countdown: Countdown | null };

export type Effect = { type: 'endBreakEarly' } | { type: 'clearSleepTimer' };

export interface Transition {
  state: RuntimeState;
  effects: Effect[];
}

export function initialState(soundId: string, autoPause: boolean, lockPause = true): RuntimeState {
  return {
    soundId,
    manual: true,
    tabAudible: false,
    tabOverride: false,
    autoPause,
    lockPause,
    screenLocked: false,
    breakActive: false,
    breakEndsAt: null,
    nextBreakAt: null,
    sleepEndsAt: null,
    sleepMin: null,
    error: null,
    countdown: null,
  };
}

/** Pressing play expresses explicit intent: it clears every reason. */
function play(s: RuntimeState, audibleNow = false): Transition {
  const effects: Effect[] = [];
  // A pending pause countdown survives (the break still comes); ending a break clears its resume countdown.
  const next = { ...s, manual: false, error: null, countdown: s.breakActive ? null : s.countdown };
  if ((s.tabAudible || audibleNow) && s.autoPause) next.tabOverride = true;
  if (s.breakActive) {
    next.breakActive = false;
    next.breakEndsAt = null;
    // Alarms/notification cleanup + scheduling the next break happen in the worker.
    effects.push({ type: 'endBreakEarly' });
  }
  return { state: next, effects };
}

/** Manual pause; a running sleep timer has nothing left to stop, so it's cancelled. */
function pause(s: RuntimeState, extra: Partial<RuntimeState> = {}): Transition {
  const effects: Effect[] = s.sleepEndsAt ? [{ type: 'clearSleepTimer' }] : [];
  return { state: { ...s, ...extra, manual: true, sleepEndsAt: null, sleepMin: null, countdown: null }, effects };
}

export function reduce(s: RuntimeState, e: StateEvent): Transition {
  switch (e.type) {
    case 'play':
      return play(s, e.audibleNow);
    case 'pause':
      return pause(s);
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
      return { state: { ...s, breakActive: true, breakEndsAt: e.endsAt, countdown: null }, effects: [] };
    case 'breakEnd':
      return { state: { ...s, breakActive: false, breakEndsAt: null, countdown: null }, effects: [] };
    case 'nextBreak':
      // Rescheduling (snooze, skip, interval change, toggle) invalidates any pending heads-up.
      return { state: { ...s, nextBreakAt: e.at, countdown: null }, effects: [] };
    case 'screenLocked':
      return { state: { ...s, screenLocked: e.locked }, effects: [] };
    case 'lockPause':
      return { state: { ...s, lockPause: e.enabled }, effects: [] };
    case 'sleepTimer':
      return { state: { ...s, sleepEndsAt: e.endsAt, sleepMin: e.endsAt ? e.minutes : null }, effects: [] };
    case 'sleepTimerFired':
      // Alarm already fired, so no cleanup effect needed.
      return s.sleepEndsAt
        ? { state: { ...s, manual: true, sleepEndsAt: null, sleepMin: null }, effects: [] }
        : { state: s, effects: [] };
    case 'error':
      return pause(s, { error: e.message });
    case 'countdown':
      return { state: { ...s, countdown: e.countdown }, effects: [] };
  }
}

/**
 * A break transition only gets a countdown + chime when it actually changes what you hear:
 * before a break if the sound is playing; before the break ends if the break is the only
 * thing keeping it paused (not manually paused, not locked, no other tab audible).
 */
export function shouldCountdown(s: RuntimeState, kind: ChimeKind): boolean {
  if (kind === 'pause') return !s.breakActive && isPlaying(s);
  const r = pauseReasons(s);
  return s.breakActive && r.length === 1 && r[0] === 'break';
}

export type StatusKind = 'playing' | 'paused' | 'auto-tab' | 'away' | 'break';

/** Highest-priority explanation for the UI. */
export function statusKind(s: RuntimeState): StatusKind {
  const r = pauseReasons(s);
  if (r.length === 0) return 'playing';
  if (r.includes('break')) return 'break';
  if (r.includes('manual')) return 'paused';
  if (r.includes('away')) return 'away';
  return 'auto-tab';
}

/**
 * Whether a scheduled break transition is still due, independent of whether its countdown is
 * shown: a break start until it starts or is rescheduled; a break end while the break lasts.
 */
export function transitionDue(s: RuntimeState, t: Countdown): boolean {
  return t.kind === 'pause' ? !s.breakActive && s.nextBreakAt === t.at : s.breakActive;
}

/** Whole seconds left in a break heads-up countdown, never below 1 while it's showing. */
export const countdownSeconds = (at: number, now = Date.now()) => Math.max(1, Math.ceil((at - now) / 1000));
