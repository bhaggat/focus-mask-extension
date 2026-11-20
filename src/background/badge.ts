import { statusKind } from '../shared/state';
import type { RuntimeState } from '../shared/types';

/**
 * Toolbar indicator so the user can see at a glance whether sound is on and,
 * more importantly, why it stopped (auto-pause and breaks happen without any
 * user action). Manually paused = no badge.
 */
const STYLES = {
  playing: { text: 'ON', color: '#1F9D8F', label: 'Playing' },
  'auto-tab': { text: 'II', color: '#C98A00', label: 'Auto-paused — another tab is playing audio' },
  away: { text: 'II', color: '#7A7F99', label: 'Paused while your screen is locked' },
  break: { text: 'BRK', color: '#6D5DF6', label: 'On a break' },
  paused: { text: '', color: '#6D5DF6', label: 'Paused' },
} as const;

const ERROR_STYLE = { text: '!', color: '#D93838' };

let last = '';

export async function updateBadge(state: RuntimeState, soundName: string | undefined) {
  const kind = statusKind(state);
  const base = STYLES[kind];
  const style = state.error && kind === 'paused' ? ERROR_STYLE : base;
  const detail = state.error && kind === 'paused' ? state.error : kind === 'playing' && soundName ? `Playing ${soundName}` : base.label;
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
