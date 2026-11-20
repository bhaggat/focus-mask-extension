import type { StatusKind } from './state';

const LONG: Record<StatusKind, string> = {
  playing: 'Playing',
  paused: 'Paused',
  'auto-tab': 'Auto-paused — another tab is playing audio',
  away: 'Paused — screen locked',
  break: 'On a break',
};

const SHORT: Record<StatusKind, string> = {
  playing: 'Playing',
  paused: 'Paused',
  'auto-tab': 'Auto-paused',
  away: 'Screen locked',
  break: 'On a break',
};

/** One source of truth for status wording across popup, options and the toolbar tooltip. */
export function statusLabel(kind: StatusKind, variant: 'long' | 'short' = 'long'): string {
  return (variant === 'short' ? SHORT : LONG)[kind];
}
