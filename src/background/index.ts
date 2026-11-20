import { CUSTOM_CHANNEL, getCustomSound, hasCustomSound } from '../shared/db';
import { loadSettings, saveSettings, SLEEP_LIMITS } from '../shared/settings';
import { initialState, isPlaying, reduce, shouldCountdown, transitionDue, type StateEvent } from '../shared/state';
import { builtinById, DEFAULT_SOUND_ID, isBuiltinId, isCustomId } from '../shared/sounds';
import type { BgMessage, ChimeKind, Countdown, MediaSessionConfig, RuntimeState, Settings } from '../shared/types';
import {
  ALARM_BREAK_END,
  ALARM_BREAK_END_WARN,
  ALARM_BREAK_START,
  ALARM_BREAK_WARN,
  BUTTON_SKIP,
  BUTTON_SNOOZE,
  clearBreakAlarms,
  clearBreakEndAlarms,
  clearBreakNotification,
  ensureWarnAlarms,
  NOTIF_BREAK,
  scheduleBreakEnd,
  scheduleNextBreak,
  showBreakEnded,
  showBreakStarted,
  SNOOZE_MIN,
} from './breaks';
import { updateBadge } from './badge';
import { CountdownTicker } from './countdown';
import { offscreenStatus, sendToOffscreen } from './offscreen';
import { AudibleDebouncer, anyAudibleTab } from './tabs';

const STATE_KEY = 'runtime';
const ALARM_SLEEP = 'sleep-timer';
/** queryState() needs an idle threshold even though we only care about 'locked'. */
const IDLE_THRESHOLD_SEC = 15 * 60;

let state: RuntimeState;
let settings: Settings;
let debouncer: AudibleDebouncer;

// Every mutation goes through this queue so async handlers never interleave.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch((e) => console.error('[FocusMask]', e));
  return run;
}

async function resolveSoundId(id: string): Promise<string> {
  if (isBuiltinId(id)) return id;
  if (isCustomId(id) && (await hasCustomSound(id))) return id;
  return DEFAULT_SOUND_ID;
}

let customName: { id: string; name: string | undefined } | null = null;
async function soundName(id: string): Promise<string | undefined> {
  if (!isCustomId(id)) return builtinById(id)?.name;
  if (customName?.id !== id) customName = { id, name: (await getCustomSound(id).catch(() => undefined))?.name };
  return customName.name;
}

async function persist() {
  await chrome.storage.session.set({ [STATE_KEY]: state });
  await updateBadge(state, await soundName(state.soundId)).catch((e: unknown) => console.warn('[FocusMask] badge', e));
  await syncMediaSession();
}

/**
 * The break transition armed by a warning alarm. It fires at `at` from the worker's own timer
 * because packed extensions clamp alarms to ≥30 s apart, so the main alarm can land ~25 s after
 * its warning. It's independent of the visible countdown: clearing the countdown (play, pause,
 * a lock) must not delay the break. startBreak/endBreakOnTimer are idempotent with the main alarm.
 */
let pending: Countdown | null = null;

const ticker = new CountdownTicker(
  () => void ready.then(async () => updateBadge(state, await soundName(state.soundId)).catch(() => undefined)),
  () =>
    void ready.then(() =>
      serial(async () => {
        const due = pending;
        pending = null;
        if (!due || !transitionDue(state, due)) return;
        if (due.kind === 'pause') await startBreak();
        else await endBreakOnTimer();
      }),
    ),
);

/**
 * Warning alarm, 5 s before a break starts or ends: arm the transition and, when it changes what
 * you hear (see shouldCountdown), show the countdown and play the chime.
 */
async function onBreakWarn(kind: ChimeKind) {
  if (!settings.breakEnabled) return;
  if (kind === 'pause' ? state.breakActive : !state.breakActive) return;
  const main = await chrome.alarms.get(kind === 'pause' ? ALARM_BREAK_START : ALARM_BREAK_END);
  const at = main?.scheduledTime ?? (kind === 'pause' ? state.nextBreakAt : state.breakEndsAt);
  if (!at || at <= Date.now()) return;
  // The alarm is the source of truth for when the break starts (as in reconcileBreaks).
  if (kind === 'pause' && state.nextBreakAt !== at) await apply({ type: 'nextBreak', at });
  pending = { kind, at };
  ticker.start(at);
  if (!shouldCountdown(state, kind)) return;
  await apply({ type: 'countdown', countdown: { kind, at } });
  // Resume chime: the offscreen doc may have been reclaimed during the silent break.
  await sendToOffscreen({ type: 'chime', kind, volume: settings.volume }, { create: kind === 'resume' }).catch(
    (e: unknown) => console.warn('[FocusMask] chime', e),
  );
}

/**
 * Headphone / media keys reach us only while no other tab is audible: if music or a
 * call is playing elsewhere we release the OS media session so the key goes there.
 */
async function mediaSessionConfig(): Promise<MediaSessionConfig> {
  return {
    enabled: settings.mediaKeys && !state.tabAudible,
    title: (await soundName(state.soundId)) ?? 'FocusMask',
  };
}

let sentSession: string | null = null;
async function syncMediaSession() {
  const session = await mediaSessionConfig();
  const key = JSON.stringify(session);
  if (key === sentSession) return;
  // No document → nothing to update; the next play message carries the config.
  const res = await sendToOffscreen({ type: 'session', session }).catch(() => null);
  sentSession = res ? key : null;
}

async function onMediaKey(action: 'play' | 'pause') {
  if (!settings.mediaKeys) return;
  if (action === 'pause') return apply({ type: 'pause' });
  // Another tab started playing before the debounce caught up: the key was meant for it.
  const audibleNow = await anyAudibleTab();
  if (state.tabAudible || audibleNow) return;
  await apply({ type: 'play', audibleNow });
}

/**
 * Session state is wiped on extension reload/update but alarms survive (and
 * vice versa on some restarts). Make the two agree so the UI never shows
 * "Breaks off" while a break alarm is pending, and a break can't get stuck.
 */
async function reconcileBreaks() {
  if (!settings.breakEnabled) {
    await clearBreakAlarms();
    if (state.breakActive) await apply({ type: 'breakEnd' });
    if (state.nextBreakAt !== null) await apply({ type: 'nextBreak', at: null });
    return;
  }
  if (state.breakActive) {
    if (await chrome.alarms.get(ALARM_BREAK_END)) return;
    if (state.breakEndsAt && state.breakEndsAt > Date.now()) {
      await chrome.alarms.create(ALARM_BREAK_END, { when: state.breakEndsAt });
    } else {
      await endBreakOnTimer();
    }
    return;
  }
  const pending = await chrome.alarms.get(ALARM_BREAK_START);
  const at = pending?.scheduledTime ?? (await scheduleNextBreak(settings.breakIntervalMin));
  if (state.nextBreakAt !== at) await apply({ type: 'nextBreak', at });
}

const ready: Promise<void> = (async () => {
  settings = await loadSettings();
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as Partial<RuntimeState> | undefined;
  // Spread over a fresh state so fields added in newer versions always exist.
  state = { ...initialState(await resolveSoundId(settings.soundId), settings.autoPause, settings.pauseOnLock), ...stored };
  state.autoPause = settings.autoPause;
  state.lockPause = settings.pauseOnLock;
  state.screenLocked = (await chrome.idle.queryState(IDLE_THRESHOLD_SEC)) === 'locked';
  debouncer = new AudibleDebouncer(state.tabAudible, (audible) => {
    void serial(() => apply({ type: 'tabAudible', audible }));
  });
  // A countdown whose moment passed while the worker slept is stale; otherwise keep ticking.
  if (state.countdown && state.countdown.at <= Date.now()) state.countdown = null;
  await persist();
  // Reconcile anything that changed while the worker was asleep (or alarms lost on update).
  debouncer.push(await anyAudibleTab());
  await reconcileBreaks();
  if (settings.breakEnabled) await ensureWarnAlarms();
  await reconcileSleepTimer();
  if (state.countdown) {
    pending = state.countdown;
    ticker.start(state.countdown.at);
  }
})();

async function reconcileSleepTimer() {
  const alarm = await chrome.alarms.get(ALARM_SLEEP);
  if (!state.sleepEndsAt) {
    if (alarm) await chrome.alarms.clear(ALARM_SLEEP);
  } else if (!alarm) {
    if (state.sleepEndsAt > Date.now()) await chrome.alarms.create(ALARM_SLEEP, { when: state.sleepEndsAt });
    else await apply({ type: 'sleepTimerFired' });
  }
}

async function setSleepTimer(minutes: number | null) {
  await chrome.alarms.clear(ALARM_SLEEP);
  if (minutes === null || !Number.isFinite(minutes)) {
    await apply({ type: 'sleepTimer', endsAt: null, minutes: null });
    return;
  }
  // A timer only makes sense while something plays: choosing one while paused starts playback.
  // (Play never clears the timer; pause does — so play first, then set it.)
  if (!isPlaying(state)) await apply({ type: 'play', audibleNow: await anyAudibleTab() });
  const m = Math.round(Math.min(SLEEP_LIMITS.max, Math.max(SLEEP_LIMITS.min, minutes)));
  const endsAt = Date.now() + m * 60_000;
  await chrome.alarms.create(ALARM_SLEEP, { when: endsAt });
  await apply({ type: 'sleepTimer', endsAt, minutes: m });
}

async function apply(event: StateEvent): Promise<void> {
  const wasPlaying = isPlaying(state);
  const prevSound = state.soundId;
  const { state: next, effects } = reduce(state, event);
  state = next;
  for (const fx of effects) {
    if (fx.type === 'endBreakEarly') await finishBreakBookkeeping(settings.breakIntervalMin);
    else if (fx.type === 'clearSleepTimer') await chrome.alarms.clear(ALARM_SLEEP);
  }
  // Rescheduled, toggled off, or already happened: drop the armed transition.
  if (pending && !transitionDue(state, pending)) {
    pending = null;
    ticker.stop();
  }
  await persist();
  if (isPlaying(state) !== wasPlaying || (isPlaying(state) && state.soundId !== prevSound)) await syncAudio();
}

/** Apply a volume change; if Chrome reclaimed the (silent, volume-0) offscreen doc, recreate it. */
async function applyVolume(volume: number) {
  const res = await sendToOffscreen({ type: 'volume', volume }).catch(() => null);
  if (!res && isPlaying(state) && volume > 0) await syncAudio();
}

async function syncAudio(): Promise<void> {
  if (!isPlaying(state)) {
    await sendToOffscreen({ type: 'pause' });
    return;
  }
  const session = await mediaSessionConfig();
  const playMsg = { type: 'play', soundId: state.soundId, volume: settings.volume, session } as const;
  sentSession = JSON.stringify(session);
  let res: { ok: boolean; error?: string } | null;
  try {
    res = await sendToOffscreen(playMsg, { create: true });
  } catch {
    // Doc may have been closing between the existence check and the send — retry once on a fresh one.
    try {
      res = await sendToOffscreen(playMsg, { create: true });
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (res && !res.ok) {
    const fallback = isCustomId(state.soundId) && !(await hasCustomSound(state.soundId));
    state = reduce(state, { type: 'error', message: res.error ?? 'Playback failed.' }).state;
    if (fallback) {
      state.soundId = DEFAULT_SOUND_ID;
      await saveSettings({ soundId: DEFAULT_SOUND_ID });
    }
    await persist();
  }
}

/** Break ended for any reason other than its timer: clean up and schedule the next one. */
async function finishBreakBookkeeping(nextInMin: number) {
  await clearBreakEndAlarms();
  await clearBreakNotification();
  const at = settings.breakEnabled ? await scheduleNextBreak(nextInMin) : null;
  state = reduce(state, { type: 'nextBreak', at }).state;
}

async function startBreak() {
  if (!settings.breakEnabled || state.breakActive) return;
  const wasPlaying = isPlaying(state);
  const endsAt = await scheduleBreakEnd(settings.breakLengthMin);
  state = reduce(state, { type: 'nextBreak', at: null }).state;
  await apply({ type: 'breakStart', endsAt });
  await showBreakStarted(settings.breakLengthMin, wasPlaying);
}

async function endBreakOnTimer() {
  if (!state.breakActive) return;
  await apply({ type: 'breakEnd' });
  const at = settings.breakEnabled ? await scheduleNextBreak(settings.breakIntervalMin) : null;
  await apply({ type: 'nextBreak', at });
  await showBreakEnded(isPlaying(state));
}

async function endBreakEarly(nextInMin: number) {
  if (!state.breakActive) return;
  await finishBreakBookkeeping(nextInMin);
  await apply({ type: 'breakEnd' });
}

async function onSettingsChanged(prev: Settings, next: Settings) {
  settings = next;
  if (prev.volume !== next.volume) await applyVolume(next.volume);
  if (prev.autoPause !== next.autoPause) await apply({ type: 'autoPause', enabled: next.autoPause });
  if (prev.pauseOnLock !== next.pauseOnLock) await apply({ type: 'lockPause', enabled: next.pauseOnLock });
  if (prev.mediaKeys !== next.mediaKeys) await syncMediaSession();

  if (!next.breakEnabled && prev.breakEnabled) {
    await clearBreakAlarms();
    await clearBreakNotification();
    if (state.breakActive) await apply({ type: 'breakEnd' });
    await apply({ type: 'nextBreak', at: null });
  } else if (next.breakEnabled && (!prev.breakEnabled || prev.breakIntervalMin !== next.breakIntervalMin)) {
    if (!state.breakActive) await apply({ type: 'nextBreak', at: await scheduleNextBreak(next.breakIntervalMin) });
  }
}

async function handleMessage(msg: BgMessage): Promise<unknown> {
  switch (msg.type) {
    case 'toggle':
    case 'play':
    case 'pause':
      await apply({ type: msg.type, audibleNow: msg.type === 'pause' ? false : await anyAudibleTab() });
      break;
    case 'select': {
      const soundId = await resolveSoundId(msg.soundId);
      await apply({ type: 'select', soundId, play: msg.play ?? true, audibleNow: await anyAudibleTab() });
      if (settings.soundId !== soundId) settings = await saveSettings({ soundId, volume: settings.volume });
      break;
    }
    case 'volume':
      settings = { ...settings, volume: msg.volume };
      await applyVolume(msg.volume);
      if (msg.persist) settings = await saveSettings({ volume: msg.volume });
      break;
    case 'settings': {
      const prev = settings;
      await onSettingsChanged(prev, await saveSettings({ volume: prev.volume, ...msg.patch }));
      break;
    }
    case 'endBreak':
      await endBreakEarly(settings.breakIntervalMin);
      break;
    case 'restartBreakTimer':
      if (settings.breakEnabled && !state.breakActive) {
        await apply({ type: 'nextBreak', at: await scheduleNextBreak(settings.breakIntervalMin) });
      }
      break;
    case 'sleepTimer':
      await setSleepTimer(msg.minutes);
      break;
    case 'mediaKey':
      await onMediaKey(msg.action);
      break;
    case 'customDeleted':
      if (state.soundId === msg.soundId) {
        await apply({ type: 'pause' });
        await apply({ type: 'select', soundId: DEFAULT_SOUND_ID, play: false });
        settings = await saveSettings({ soundId: DEFAULT_SOUND_ID });
      }
      break;
    case 'audioStatus':
      return offscreenStatus();
    case 'getState':
      break;
  }
  return { state, settings };
}

chrome.runtime.onMessage.addListener((msg: BgMessage & { target?: string }, _sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false;
  void ready
    .then(() => serial(() => handleMessage(msg)))
    .then(sendResponse, (e: unknown) => sendResponse({ error: String(e), state, settings }));
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-playback') {
    void ready.then(() => serial(async () => apply({ type: 'toggle', audibleNow: await anyAudibleTab() })));
  }
});

const recheckTabs = () =>
  void ready.then(async () => {
    const audible = await anyAudibleTab();
    debouncer.push(audible);
    // An override set during the debounce window must not outlive the episode that caused it.
    if (!audible && !debouncer.value && state.tabOverride) await serial(() => apply({ type: 'tabAudible', audible: false }));
  });

chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.audible !== undefined || info.mutedInfo !== undefined) recheckTabs();
});
chrome.tabs.onRemoved.addListener(recheckTabs);
chrome.tabs.onReplaced.addListener(recheckTabs);

chrome.alarms.onAlarm.addListener((alarm) => {
  void ready.then(() =>
    serial(async () => {
      if (alarm.name === ALARM_BREAK_START) await startBreak();
      else if (alarm.name === ALARM_BREAK_END) await endBreakOnTimer();
      else if (alarm.name === ALARM_BREAK_WARN) await onBreakWarn('pause');
      else if (alarm.name === ALARM_BREAK_END_WARN) await onBreakWarn('resume');
      else if (alarm.name === ALARM_SLEEP) await apply({ type: 'sleepTimerFired' });
    }),
  );
});

// Only 'locked' matters: idle-but-unlocked usually means reading or listening, not away.
chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SEC);
chrome.idle.onStateChanged.addListener((idle) => {
  void ready.then(() => serial(() => apply({ type: 'screenLocked', locked: idle === 'locked' })));
});

// A custom sound was renamed/added/deleted in the options page: refresh the cached name in the tooltip.
new BroadcastChannel(CUSTOM_CHANNEL).onmessage = () => {
  customName = null;
  void ready.then(() => serial(persist));
};

// Clicking the notification body just acknowledges it.
chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIF_BREAK) void clearBreakNotification();
});

chrome.notifications.onButtonClicked.addListener((id, index) => {
  if (id !== NOTIF_BREAK) return;
  void ready.then(() =>
    serial(async () => {
      if (index === BUTTON_SNOOZE) await endBreakEarly(SNOOZE_MIN);
      else if (index === BUTTON_SKIP) await endBreakEarly(settings.breakIntervalMin);
    }),
  );
});

// Settings changed elsewhere (another device via sync, or the options page).
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'sync') return;
  void ready.then(() =>
    serial(async () => {
      const next = await loadSettings();
      const prev = settings;
      if (JSON.stringify(prev) !== JSON.stringify(next)) await onSettingsChanged(prev, next);
    }),
  );
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void ready.then(() =>
    serial(async () => {
      // Normalize stored settings inside the queue so it can't race other settings writes.
      settings = await saveSettings({ volume: settings.volume });
      if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
      }
    }),
  );
});

chrome.runtime.onStartup.addListener(() => {
  void ready.then(() =>
    serial(async () => {
      // Fresh browser session: never auto-play, restart the break clock, drop any sleep timer.
      await clearBreakEndAlarms();
      await chrome.alarms.clear(ALARM_SLEEP);
      if (state.sleepEndsAt) await apply({ type: 'sleepTimer', endsAt: null, minutes: null });
      if (state.breakActive) await apply({ type: 'breakEnd' });
      const at = settings.breakEnabled ? await scheduleNextBreak(settings.breakIntervalMin) : null;
      await apply({ type: 'nextBreak', at });
    }),
  );
});
