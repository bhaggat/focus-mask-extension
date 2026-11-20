import { Pause, Play, Settings as Gear, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isPlaying, statusKind } from '../shared/state';
import { BUILTIN_SOUNDS, builtinById, isCustomId } from '../shared/sounds';
import { Kbd, Logo, SoundIcon, Toggle } from '../ui/components';
import { formatCountdown, formatMinutes, send, useCustomSounds, useNow, useShortcut, useSnapshot } from '../ui/hooks';

const SLEEP_PRESETS = [
  { min: 15, label: '15m', long: '15 minutes' },
  { min: 30, label: '30m', long: '30 minutes' },
  { min: 60, label: '1h', long: '1 hour' },
  { min: 120, label: '2h', long: '2 hours' },
];

export function App() {
  const snap = useSnapshot();
  const { list: custom } = useCustomSounds();
  const shortcut = useShortcut();
  const [volume, setVolume] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow(!!snap && (snap.state.breakActive || snap.settings.breakEnabled || !!snap.state.sleepEndsAt));

  useEffect(() => {
    if (snap && volume === null) setVolume(snap.settings.volume);
  }, [snap, volume]);

  if (!snap) return <div className="popup popup-loading" aria-busy="true" />;
  const { state, settings } = snap;
  const playing = isPlaying(state);
  const kind = statusKind(state);
  const customMeta = custom.find((c) => c.id === state.soundId);
  const soundName = isCustomId(state.soundId) ? (customMeta?.name ?? 'Custom sound') : builtinById(state.soundId)?.name;

  const statusText = {
    playing: 'Playing',
    paused: 'Paused',
    'auto-tab': 'Auto-paused — another tab is playing audio',
    away: 'Paused — screen locked',
    break: state.breakEndsAt ? `On a break · resumes in ${formatCountdown(state.breakEndsAt - now)}` : 'On a break',
  }[kind];

  const vol = volume ?? settings.volume;
  const onVolume = (v: number) => {
    setVolume(v);
    void send({ type: 'volume', volume: v });
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => void send({ type: 'volume', volume: v, persist: true }), 400);
  };
  // Persist immediately on release so closing the popup right after a drag never loses it.
  const flushVolume = (v: number) => {
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = null;
    void send({ type: 'volume', volume: v, persist: true });
  };
  const VolIcon = vol === 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;

  return (
    <div className="popup">
      <header className="p-head">
        <Logo size={22} />
        <strong>FocusMask</strong>
        <button
          className="icon-btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Settings & library"
          aria-label="Open settings"
        >
          <Gear size={18} />
        </button>
      </header>

      <section className="p-hero">
        <button
          className="play-btn"
          data-playing={playing}
          onClick={() => void send({ type: 'toggle' })}
          aria-label={playing ? 'Pause' : 'Play'}
          data-testid="toggle"
        >
          {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
        </button>
        <div className="p-now">
          <div className="p-sound" data-testid="sound-name">
            {soundName}
          </div>
          <div className="p-status" data-testid="status" data-kind={kind}>
            <span className="dot" data-kind={kind} /> {statusText}
          </div>
          {state.error && <div className="p-error">{state.error}</div>}
        </div>
      </section>

      {kind === 'break' && (
        <button className="btn p-wide" onClick={() => void send({ type: 'endBreak' })}>
          End break &amp; resume
        </button>
      )}

      <label className="p-volume">
        <VolIcon size={18} aria-hidden />
        <span className="sr-only">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={vol}
          style={{ ['--fill' as string]: `${vol * 100}%` }}
          onChange={(e) => onVolume(Number(e.target.value))}
          onPointerUp={(e) => flushVolume(Number(e.currentTarget.value))}
          onKeyUp={(e) => flushVolume(Number(e.currentTarget.value))}
          aria-label="Volume"
        />
      </label>

      <div className="p-grid" role="group" aria-label="Sounds">
        {BUILTIN_SOUNDS.map((s) => (
          <button
            key={s.id}
            className="sound-tile"
            aria-pressed={state.soundId === s.id}
            onClick={() => void send({ type: 'select', soundId: s.id, play: true })}
            title={s.blurb}
          >
            <SoundIcon id={s.id} />
            <span>{s.name.replace(' noise', '')}</span>
          </button>
        ))}
      </div>

      {custom.length > 0 && (
        <>
          <div className="p-subhead">My sounds</div>
          <div className="p-custom">
            {custom.map((c) => (
              <button
                key={c.id}
                className="p-custom-item"
                aria-pressed={state.soundId === c.id}
                onClick={() => void send({ type: 'select', soundId: c.id, play: true })}
              >
                <SoundIcon id="custom" size={16} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <footer className="p-foot">
        <div className="p-row">
          <div>
            <div className="p-row-title">Auto-pause</div>
            <div className="p-row-sub">When another browser tab plays audio</div>
          </div>
          <Toggle
            label="Auto-pause when another tab plays audio"
            checked={settings.autoPause}
            onChange={(v) => void send({ type: 'settings', patch: { autoPause: v } })}
          />
        </div>
        <div className="p-row">
          <div>
            <div className="p-row-title">Sleep timer</div>
            <div className="p-row-sub p-nowrap" data-testid="sleep-status">
              {state.sleepEndsAt ? `Pauses in ${formatCountdown(state.sleepEndsAt - now)}` : 'Off'}
            </div>
          </div>
          <div className="p-chips" role="group" aria-label="Sleep timer">
            {SLEEP_PRESETS.map((p) => {
              const on = !!state.sleepEndsAt && state.sleepMin === p.min;
              return (
                <button
                  key={p.min}
                  className="p-chip"
                  aria-pressed={on}
                  aria-label={on ? `Cancel ${p.long} sleep timer` : `Pause after ${p.long}`}
                  title={on ? 'Cancel timer' : `Pause after ${p.long}`}
                  onClick={() => void send({ type: 'sleepTimer', minutes: on ? null : p.min })}
                >
                  {p.label}
                  {on && <X size={11} strokeWidth={3} aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-meta">
          {settings.breakEnabled && state.nextBreakAt && !state.breakActive ? (
            <span>Next break in {formatMinutes(state.nextBreakAt - now)}</span>
          ) : (
            <span>Breaks off</span>
          )}
          {shortcut ? (
            <span>
              <Kbd>{shortcut}</Kbd> play/pause
            </span>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
