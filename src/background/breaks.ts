export const ALARM_BREAK_START = 'break-start';
export const ALARM_BREAK_END = 'break-end';
/** Fire COUNTDOWN_MS before their main alarm to start the heads-up countdown + chime. */
export const ALARM_BREAK_WARN = 'break-warn';
export const ALARM_BREAK_END_WARN = 'break-end-warn';
export const COUNTDOWN_MS = 5000;

const WARN_FOR: Record<string, string> = { 'break-start': ALARM_BREAK_WARN, 'break-end': ALARM_BREAK_END_WARN };
export const NOTIF_BREAK = 'focusmask-break';
export const SNOOZE_MIN = 10;

export const BUTTON_SNOOZE = 0;
export const BUTTON_SKIP = 1;

const MIN = 60_000;

async function schedule(name: string, when: number, now: number) {
  const warn = WARN_FOR[name];
  await Promise.all([chrome.alarms.clear(name), chrome.alarms.clear(warn)]);
  await chrome.alarms.create(name, { when });
  if (when - COUNTDOWN_MS > now) await chrome.alarms.create(warn, { when: when - COUNTDOWN_MS });
}

export async function scheduleNextBreak(intervalMin: number, now = Date.now()): Promise<number> {
  const when = now + intervalMin * MIN;
  await schedule(ALARM_BREAK_START, when, now);
  return when;
}

export async function scheduleBreakEnd(lengthMin: number, now = Date.now()): Promise<number> {
  const when = now + lengthMin * MIN;
  await schedule(ALARM_BREAK_END, when, now);
  return when;
}

export async function clearBreakAlarms() {
  await Promise.all(
    [ALARM_BREAK_START, ALARM_BREAK_WARN, ALARM_BREAK_END, ALARM_BREAK_END_WARN].map((n) => chrome.alarms.clear(n)),
  );
}

/** Clear just the break-end pair (break ended early). */
export async function clearBreakEndAlarms() {
  await Promise.all([chrome.alarms.clear(ALARM_BREAK_END), chrome.alarms.clear(ALARM_BREAK_END_WARN)]);
}

/** Restore a warning alarm lost (e.g. on update) while its main alarm is still far enough out. */
export async function ensureWarnAlarms(now = Date.now()) {
  for (const [main, warn] of Object.entries(WARN_FOR)) {
    const m = await chrome.alarms.get(main);
    if (!m || (await chrome.alarms.get(warn))) continue;
    if (m.scheduledTime - COUNTDOWN_MS > now) await chrome.alarms.create(warn, { when: m.scheduledTime - COUNTDOWN_MS });
  }
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
