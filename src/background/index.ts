import { getCustomSound } from '../shared/db';
import { loadSettings, saveSettings } from '../shared/settings';
import { initialState, isPlaying, reduce, type StateEvent } from '../shared/state';
import { DEFAULT_SOUND_ID, isBuiltinId, isCustomId } from '../shared/sounds';
import type { BgMessage, RuntimeState, Settings } from '../shared/types';
import {
  ALARM_BREAK_END,
  ALARM_BREAK_START,
  BUTTON_SKIP,
  BUTTON_SNOOZE,
  clearBreakAlarms,
  clearBreakNotification,
  NOTIF_BREAK,
  scheduleBreakEnd,
  scheduleNextBreak,
  showBreakEnded,
  showBreakStarted,
  SNOOZE_MIN,
} from './breaks';
import { offscreenStatus, sendToOffscreen } from './offscreen';
import { AudibleDebouncer, anyAudibleTab } from './tabs';

const STATE_KEY = 'runtime';

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
  if (isCustomId(id) && (await getCustomSound(id))) return id;
  return DEFAULT_SOUND_ID;
}

const persist = () => chrome.storage.session.set({ [STATE_KEY]: state });

const ready: Promise<void> = (async () => {
  settings = await loadSettings();
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as RuntimeState | undefined;
  state = stored ?? initialState(await resolveSoundId(settings.soundId), settings.autoPause);
  state.autoPause = settings.autoPause;
  debouncer = new AudibleDebouncer(state.tabAudible, (audible) => {
    void serial(() => apply({ type: 'tabAudible', audible }));
  });
  if (!stored) await persist();
  // Reconcile anything that changed while the worker was asleep (or alarms lost on update).
  debouncer.push(await anyAudibleTab());
  if (settings.breakEnabled && !state.breakActive && !(await chrome.alarms.get(ALARM_BREAK_START))) {
    state.nextBreakAt = await scheduleNextBreak(settings.breakIntervalMin);
    await persist();
  }
})();

async function apply(event: StateEvent): Promise<void> {
  const wasPlaying = isPlaying(state);
  const prevSound = state.soundId;
  const { state: next, effects } = reduce(state, event);
  state = next;
  for (const fx of effects) {
    if (fx.type === 'endBreakEarly') await finishBreakBookkeeping(settings.breakIntervalMin);
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
  let res: { ok: boolean; error?: string } | null;
  try {
    res = await sendToOffscreen({ type: 'play', soundId: state.soundId, volume: settings.volume }, { create: true });
  } catch {
    // Doc may have been closing between the existence check and the send — retry once on a fresh one.
    try {
      res = await sendToOffscreen({ type: 'play', soundId: state.soundId, volume: settings.volume }, { create: true });
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (res && !res.ok) {
    const fallback = isCustomId(state.soundId) && !(await getCustomSound(state.soundId));
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
  await chrome.alarms.clear(ALARM_BREAK_END);
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
    }),
  );
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
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  void ready.then(() =>
    serial(async () => {
      const next = await loadSettings();
      const prev = settings;
      if (JSON.stringify(prev) !== JSON.stringify(next)) await onSettingsChanged(prev, next);
    }),
  );
  void changes;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void ready.then(async () => {
    await saveSettings({});
    if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  void ready.then(() =>
    serial(async () => {
      // Fresh browser session: never auto-play, restart the break clock.
      await chrome.alarms.clear(ALARM_BREAK_END);
      if (state.breakActive) await apply({ type: 'breakEnd' });
      const at = settings.breakEnabled ? await scheduleNextBreak(settings.breakIntervalMin) : null;
      await apply({ type: 'nextBreak', at });
    }),
  );
});
