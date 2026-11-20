import { useCallback, useEffect, useState } from 'react';
import { CUSTOM_CHANNEL, listCustomSounds } from '../shared/db';
import type { BgMessage, CustomSoundMeta, RuntimeState, Settings } from '../shared/types';

export interface Snapshot {
  state: RuntimeState;
  settings: Settings;
}

export const send = <T = Snapshot>(msg: BgMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;

/** Live view of the worker's state + settings. */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    send({ type: 'getState' }).then((s) => alive && s && setSnap({ state: s.state, settings: s.settings }));
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.runtime?.newValue) {
        setSnap((p) => (p ? { ...p, state: changes.runtime.newValue as RuntimeState } : p));
      }
      if (area === 'sync') {
        setSnap((p) => {
          if (!p) return p;
          const settings = { ...p.settings };
          for (const [k, v] of Object.entries(changes)) {
            if (k in settings && v.newValue !== undefined) (settings as Record<string, unknown>)[k] = v.newValue;
          }
          return { ...p, settings };
        });
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);
  return snap;
}

export function useCustomSounds() {
  const [list, setList] = useState<CustomSoundMeta[]>([]);
  const refresh = useCallback(() => {
    listCustomSounds().then(setList, () => setList([]));
  }, []);
  useEffect(() => {
    refresh();
    const ch = new BroadcastChannel(CUSTOM_CHANNEL);
    ch.onmessage = refresh;
    return () => ch.close();
  }, [refresh]);
  return { list, refresh };
}

/** Re-render every second while `active` (for countdowns). */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function useShortcut(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    chrome.commands?.getAll?.().then((cmds) => {
      setKey(cmds.find((c) => c.name === 'toggle-playback')?.shortcut || '');
    });
  }, []);
  return key;
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatMinutes(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
