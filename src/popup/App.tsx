import { Pause, Play, RotateCcw, Settings as Gear, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { countdownSeconds, isPlaying, statusKind } from '../shared/state';
import { statusLabel } from '../shared/labels';
import { BREAK_LENGTH_LIMITS, SLEEP_LIMITS } from '../shared/settings';
import { BUILTIN_SOUNDS, soundDisplayName } from '../shared/sounds';
import { Kbd, Logo, SoundIcon, Toggle } from '../ui/components';
import { ReviewPrompt } from './ReviewPrompt';
import { NumberChoice } from '../ui/NumberChoice';
import { formatCountdown, formatMinutes, send, useCustomSounds, useNow, useShortcut, useSnapshot } from '../ui/hooks';

const BREAK_LENGTHS = [3, 5, 10, 15];

const formatSleep = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`);

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
  const now = useNow(
    !!snap && (snap.state.breakActive || snap.settings.breakEnabled || !!snap.state.sleepEndsAt || !!snap.state.countdown),
  );

  const dragging = useRef(false);
  const liveVolume = useRef<number | null>(null);
  const volumeFrame = useRef<number | null>(null);
  const syncedVolume = snap?.settings.volume;

  // Follow volume changes made elsewhere (options, another device) unless the user is dragging.
  useEffect(() => {
    if (syncedVolume !== undefined && !dragging.current) setVolume(syncedVolume);
  }, [syncedVolume]);

  const [sleepDraft, setSleepDraft] = useState<string | null>(null);

  if (!snap) return <div className="popup popup-loading" aria-busy="true" />;
  const { state, settings } = snap;
  const playing = isPlaying(state);
  const kind = statusKind(state);
  const soundName = soundDisplayName(state.soundId, custom);

  const cd = state.countdown;
  const cdSecs = cd ? countdownSeconds(cd.at, now) : 0;
  const statusText = cd
    ? cd.kind === 'pause'
      ? `Pausing for a break in ${cdSecs}s`
      : `Resuming in ${cdSecs}s`
    : kind === 'break' && state.breakEndsAt
      ? `On a break · resumes in ${formatCountdown(state.breakEndsAt - now)}`
      : statusLabel(kind);

  const vol = volume ?? settings.volume;
  const onVolume = (v: number) => {
    dragging.current = true;
    setVolume(v);
    // Live updates: one message per frame carrying the latest value, not one per input event.
    liveVolume.current = v;
    if (volumeFrame.current === null) {
      volumeFrame.current = requestAnimationFrame(() => {
        volumeFrame.current = null;
        if (liveVolume.current !== null) void send({ type: 'volume', volume: liveVolume.current });
        liveVolume.current = null;
      });
    }
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => flushVolume(v), 400);
  };
  // Persist immediately on release so closing the popup right after a drag never loses it.
  const flushVolume = (v: number) => {
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    if (volumeFrame.current !== null) cancelAnimationFrame(volumeFrame.current);
    volumeTimer.current = null;
    volumeFrame.current = null;
    liveVolume.current = null;
    dragging.current = false;
    void send({ type: 'volume', volume: v, persist: true });
  };
  const customSleepOn = !!state.sleepEndsAt && !SLEEP_PRESETS.some((p) => p.min === state.sleepMin);
  const commitSleep = () => {
    const n = Math.round(Number(sleepDraft));
    setSleepDraft(null);
    if (!Number.isFinite(n) || n <= 0) return;
    void send({ type: 'sleepTimer', minutes: Math.min(SLEEP_LIMITS.max, Math.max(SLEEP_LIMITS.min, n)) });
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
        <div className="p-block">
          <div className="p-row">
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
            <button
              className="p-chip"
              aria-pressed={customSleepOn || sleepDraft !== null}
              aria-label={customSleepOn ? 'Cancel custom sleep timer' : 'Custom sleep timer'}
              title={customSleepOn ? 'Cancel timer' : 'Custom duration'}
              onClick={() => {
                if (customSleepOn) void send({ type: 'sleepTimer', minutes: null });
                else setSleepDraft((d) => (d === null ? String(state.sleepMin ?? 45) : null));
              }}
            >
              {customSleepOn ? formatSleep(state.sleepMin!) : 'Custom'}
              {customSleepOn && <X size={11} strokeWidth={3} aria-hidden />}
            </button>
            {sleepDraft !== null && (
              <label className="p-custom-num">
                <input
                  type="number"
                  min={SLEEP_LIMITS.min}
                  max={SLEEP_LIMITS.max}
                  value={sleepDraft}
                  autoFocus
                  aria-label="Sleep timer minutes"
                  onChange={(e) => setSleepDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitSleep();
                    else if (e.key === 'Escape') setSleepDraft(null);
                  }}
                />
                min
              </label>
            )}
          </div>
        </div>
        {settings.breakEnabled && !state.breakActive && (
          <div className="p-block" data-testid="break-controls">
            <div className="p-row">
              <div className="p-row-title">Break length</div>
              <div className="p-row-sub p-nowrap p-break-next">
                {state.nextBreakAt ? `Next in ${formatMinutes(state.nextBreakAt - now)}` : 'Scheduling…'}
                <button
                  className="icon-btn p-mini-btn"
                  aria-label="Restart break timer"
                  title={`Restart: next break in ${settings.breakIntervalMin} min`}
                  onClick={() => void send({ type: 'restartBreakTimer' })}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>
            <NumberChoice
              variant="popup"
              label="Break length"
              value={settings.breakLengthMin}
              options={BREAK_LENGTHS}
              limits={BREAK_LENGTH_LIMITS}
              unit="min"
              onChange={(v) => void send({ type: 'settings', patch: { breakLengthMin: v } })}
            />
          </div>
        )}
        <ReviewPrompt />
        <div className="p-meta">
          {settings.breakEnabled ? (
            state.breakActive ? <span>On a break</span> : <span>Breaks every {settings.breakIntervalMin} min</span>
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
