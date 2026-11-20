import { statusLabel } from '../shared/labels';
import { countdownSeconds, statusKind } from '../shared/state';
import type { RuntimeState } from '../shared/types';

/**
 * Toolbar indicator so the user can see at a glance whether sound is on and,
 * more importantly, why it stopped (auto-pause and breaks happen without any
 * user action). Manually paused = no badge.
 */
const STYLES = {
  playing: { text: 'ON', color: '#1F9D8F' },
  'auto-tab': { text: 'II', color: '#C98A00' },
  away: { text: 'II', color: '#7A7F99' },
  break: { text: 'BRK', color: '#6D5DF6' },
  paused: { text: '', color: '#6D5DF6' },
} as const;

const ERROR_STYLE = { text: '!', color: '#D93838' };

let last = '';

const COUNTDOWN_COLOR = { pause: '#C98A00', resume: '#1F9D8F' } as const;


export async function updateBadge(state: RuntimeState, soundName: string | undefined, now = Date.now()) {
  const kind = statusKind(state);
  const base = STYLES[kind];
  const cd = state.countdown;
  const secs = cd ? countdownSeconds(cd.at, now) : 0;
  const style = cd
    ? { text: String(secs), color: COUNTDOWN_COLOR[cd.kind] }
    : state.error && kind === 'paused'
      ? ERROR_STYLE
      : base;
  const detail = cd
    ? cd.kind === 'pause'
      ? `Break in ${secs}s`
      : `Resuming in ${secs}s`
    : state.error && kind === 'paused'
      ? state.error
      : kind === 'playing' && soundName
        ? `Playing ${soundName}`
        : statusLabel(kind);
  const title = `FocusMask — ${detail}`;
  const key = `${style.text}|${style.color}|${title}`;
  if (key === last) return;
  last = key;
  await Promise.all([
    chrome.action.setBadgeText({ text: style.text }),
    chrome.action.setBadgeBackgroundColor({ color: style.color }),
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' }),
    chrome.action.setTitle({ title }),
  ]);
}
