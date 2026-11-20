export const ALARM_BREAK_START = 'break-start';
export const ALARM_BREAK_END = 'break-end';
export const NOTIF_BREAK = 'focusmask-break';
export const SNOOZE_MIN = 10;

export const BUTTON_SNOOZE = 0;
export const BUTTON_SKIP = 1;

const MIN = 60_000;

export async function scheduleNextBreak(intervalMin: number, now = Date.now()): Promise<number> {
  const when = now + intervalMin * MIN;
  await chrome.alarms.clear(ALARM_BREAK_START);
  await chrome.alarms.create(ALARM_BREAK_START, { when });
  return when;
}

export async function scheduleBreakEnd(lengthMin: number, now = Date.now()): Promise<number> {
  const when = now + lengthMin * MIN;
  await chrome.alarms.clear(ALARM_BREAK_END);
  await chrome.alarms.create(ALARM_BREAK_END, { when });
  return when;
}

export async function clearBreakAlarms() {
  await Promise.all([chrome.alarms.clear(ALARM_BREAK_START), chrome.alarms.clear(ALARM_BREAK_END)]);
}

const ICON = 'icons/icon-128.png';

export function showBreakStarted(lengthMin: number, wasPlaying: boolean) {
  return chrome.notifications.create(NOTIF_BREAK, {
    type: 'basic',
    iconUrl: ICON,
    title: 'Time for a short break',
    message: `Step away for ${lengthMin} min — stretch, rest your eyes, grab water.${
      wasPlaying ? ' Sound is paused and resumes automatically.' : ''
    }`,
    buttons: [{ title: `Snooze ${SNOOZE_MIN} min` }, { title: 'Skip break' }],
    priority: 1,
  });
}

export function showBreakEnded(resuming: boolean) {
  return chrome.notifications.create(NOTIF_BREAK, {
    type: 'basic',
    iconUrl: ICON,
    title: 'Break’s over',
    message: resuming ? 'Back to focus — your sound is resuming.' : 'Back to focus.',
    priority: 0,
  });
}

export const clearBreakNotification = () => chrome.notifications.clear(NOTIF_BREAK);
