import {
  BellRing,
  Check,
  Info,
  Keyboard,
  Library,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { MAX_UPLOAD_BYTES } from '../shared/db';
import { BREAK_INTERVAL_LIMITS, BREAK_LENGTH_LIMITS } from '../shared/settings';
import { isPlaying, statusKind } from '../shared/state';
import { BUILTIN_SOUNDS, builtinById, type SoundGroup } from '../shared/sounds';
import type { Settings } from '../shared/types';
import { Kbd, Logo, SoundIcon, Toggle } from '../ui/components';
import { send, useCustomSounds, useNow, useShortcut, useSnapshot, type Snapshot } from '../ui/hooks';
import { addUploads, formatBytes, formatDuration, removeUpload } from './upload';

const INTERVALS = [25, 30, 45, 50, 60, 90];
const LENGTHS = [3, 5, 10, 15];

const update = (patch: Partial<Settings>) => send({ type: 'settings', patch });

export function App() {
  const snap = useSnapshot();
  const params = new URLSearchParams(location.search);
  const [dismissedWelcome, setDismissedWelcome] = useState(false);

  if (!snap) return <div className="o-loading" aria-busy="true" />;
  const showWelcome = !dismissedWelcome && (params.has('welcome') || !snap.settings.onboarded);

  return (
    <div className="o-shell">
      <aside className="o-nav">
        <div className="o-brand">
          <Logo size={28} />
          <span>FocusMask</span>
        </div>
        <nav>
          <a href="#library"><Library size={16} /> Library</a>
          <a href="#my-sounds"><Upload size={16} /> My sounds</a>
          <a href="#auto-pause"><Zap size={16} /> Auto-pause</a>
          <a href="#breaks"><BellRing size={16} /> Break reminders</a>
          <a href="#shortcut"><Keyboard size={16} /> Shortcut</a>
          <a href="#privacy"><ShieldCheck size={16} /> Privacy &amp; FAQ</a>
        </nav>
        <NowPlaying snap={snap} />
      </aside>

      <main className="o-main">
        {showWelcome && (
          <Welcome
            onDone={() => {
              setDismissedWelcome(true);
              void update({ onboarded: true });
              history.replaceState(null, '', location.pathname);
            }}
          />
        )}
        <LibrarySection snap={snap} />
        <MySoundsSection snap={snap} />
        <AutoPauseSection snap={snap} />
        <BreaksSection snap={snap} />
        <ShortcutSection />
        <PrivacySection />
        <p className="o-version">FocusMask v{chrome.runtime.getManifest().version}</p>
      </main>
    </div>
  );
}

function NowPlaying({ snap }: { snap: Snapshot }) {
  const { list } = useCustomSounds();
  const name =
    builtinById(snap.state.soundId)?.name ?? list.find((c) => c.id === snap.state.soundId)?.name ?? 'Custom sound';
  const playing = isPlaying(snap.state);
  const kind = statusKind(snap.state);
  const label = { playing: 'Playing', paused: 'Paused', 'auto-tab': 'Auto-paused', break: 'On a break' }[kind];
  return (
    <div className="o-nowplaying">
      <button
        className="o-mini-play"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => void send({ type: 'toggle' })}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="o-np-text">
        <div className="o-np-name">{name}</div>
        <div className="o-np-label">
          <span className="dot" data-kind={kind} /> {label}
        </div>
      </div>
    </div>
  );
}

function Welcome({ onDone }: { onDone: () => void }) {
  const shortcut = useShortcut();
  return (
    <section className="o-card o-welcome" aria-labelledby="welcome-h">
      <button className="icon-btn o-close" onClick={onDone} aria-label="Dismiss welcome">
        <X size={18} />
      </button>
      <h1 id="welcome-h">Welcome to FocusMask</h1>
      <p className="o-lead">Ambient sound that masks distractions — and gets out of the way when you need to listen.</p>
      <ol className="o-steps">
        <li>
          <strong>Pin it.</strong> Click the puzzle icon in Chrome’s toolbar and pin FocusMask, then click it to
          play or pause.
        </li>
        <li>
          <strong>Pick a sound.</strong> Brown noise is best for masking voices; nature sounds are gentler. You can
          also upload your own.
        </li>
        <li>
          <strong>Auto-pause is on.</strong> When another <em>browser tab</em> plays audio — a meeting, a video,
          music — FocusMask pauses, then resumes when it goes quiet. It can’t hear desktop apps, phone calls or
          people in the room.
        </li>
        {shortcut ? (
          <li>
            <strong>Hands-free.</strong> Press <Kbd>{shortcut}</Kbd> in any Chrome window to play/pause.
          </li>
        ) : null}
      </ol>
      <button className="btn btn-primary" onClick={onDone}>
        <Check size={16} /> Got it
      </button>
    </section>
  );
}

function LibrarySection({ snap }: { snap: Snapshot }) {
  const groups: { id: SoundGroup; title: string; hint: string }[] = [
    { id: 'noise', title: 'Noise', hint: 'Steady and featureless — the strongest masking.' },
    { id: 'nature', title: 'Nature & ambience', hint: 'Softer, more varied soundscapes.' },
  ];
  const playing = isPlaying(snap.state);
  return (
    <section id="library" className="o-section">
      <h2>Library</h2>
      <p className="o-sub">Everything is generated on your device — works offline, no downloads.</p>
      {groups.map((g) => (
        <div key={g.id} className="o-group">
          <div className="o-group-head">
            <h3>{g.title}</h3>
            <span>{g.hint}</span>
          </div>
          <div className="o-lib-grid">
            {BUILTIN_SOUNDS.filter((s) => s.group === g.id).map((s) => {
              const active = snap.state.soundId === s.id;
              const on = active && playing;
              return (
                <button
                  key={s.id}
                  className="o-lib-card"
                  aria-pressed={active}
                  onClick={() =>
                    void send(on ? { type: 'pause' } : { type: 'select', soundId: s.id, play: true })
                  }
                >
                  <span className="o-lib-icon">
                    <SoundIcon id={s.id} size={22} />
                  </span>
                  <span className="o-lib-text">
                    <strong>{s.name}</strong>
                    <span>{s.blurb}</span>
                  </span>
                  <span className="o-lib-action" aria-hidden>
                    {on ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function MySoundsSection({ snap }: { snap: Snapshot }) {
  const { list } = useCustomSounds();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const playing = isPlaying(snap.state);

  const handle = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setErrors([]);
    try {
      const { errors } = await addUploads(files);
      setErrors(errors);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void handle([...e.dataTransfer.files]);
  };

  return (
    <section id="my-sounds" className="o-section">
      <h2>My sounds</h2>
      <p className="o-sub">
        Add your own MP3, WAV or OGG files (up to {MAX_UPLOAD_BYTES / 1048576} MB each). They stay on this device
        and loop continuously.
      </p>
      <div
        className="o-drop"
        data-drag={drag}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <Upload size={22} />
        <div>
          <strong>{busy ? 'Adding…' : 'Drop audio files here'}</strong>
          <span>or</span>
        </div>
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          accept=".mp3,.wav,.ogg,.oga,audio/mpeg,audio/wav,audio/ogg"
          multiple
          hidden
          data-testid="upload-input"
          onChange={(e) => void handle([...(e.target.files ?? [])])}
        />
      </div>
      {errors.length > 0 && (
        <ul className="o-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {list.length > 0 ? (
        <ul className="o-custom-list" data-testid="custom-list">
          {list.map((c) => {
            const on = snap.state.soundId === c.id && playing;
            return (
              <li key={c.id} className="o-custom-row" aria-current={snap.state.soundId === c.id}>
                <button
                  className="icon-btn"
                  aria-label={on ? `Pause ${c.name}` : `Play ${c.name}`}
                  onClick={() => void send(on ? { type: 'pause' } : { type: 'select', soundId: c.id, play: true })}
                >
                  {on ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <span className="o-custom-name">{c.name}</span>
                <span className="o-custom-meta">
                  {formatDuration(c.duration)} · {formatBytes(c.size)}
                </span>
                <button
                  className="icon-btn o-danger"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    if (confirm(`Delete “${c.name}”?`)) void removeUpload(c.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="o-empty">No custom sounds yet.</p>
      )}
    </section>
  );
}

function AutoPauseSection({ snap }: { snap: Snapshot }) {
  return (
    <section id="auto-pause" className="o-section">
      <h2>Auto-pause</h2>
      <div className="o-card o-setting">
        <div>
          <strong>Pause when another browser tab plays audio</strong>
          <p>Resumes automatically once that tab has been quiet for a couple of seconds.</p>
        </div>
        <Toggle
          id="autopause-toggle"
          label="Pause when another browser tab plays audio"
          checked={snap.settings.autoPause}
          onChange={(v) => void update({ autoPause: v })}
        />
      </div>
      <div className="o-callout">
        <Info size={18} />
        <div>
          <p>
            <strong>What it can see:</strong> only whether some other Chrome tab is making sound — e.g. Google Meet,
            Zoom or Teams <em>in the browser</em>, YouTube, Spotify Web. It doesn’t know which site it is, and muted
            tabs are ignored.
          </p>
          <p>
            <strong>What it can’t see:</strong> the Zoom/Teams <em>desktop apps</em>, phone calls, other apps on your
            computer, or people talking in the room. Use the toolbar button or keyboard shortcut for those.
          </p>
          <p>
            Pressing play while a tab is making sound overrides auto-pause until that tab goes quiet.
          </p>
        </div>
      </div>
    </section>
  );
}

function NumberChoice({
  value,
  options,
  limits,
  unit,
  onChange,
  label,
}: {
  value: number;
  options: number[];
  limits: { min: number; max: number };
  unit: string;
  onChange: (v: number) => void;
  label: string;
}) {
  const [custom, setCustom] = useState(!options.includes(value));
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="o-choice" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          className="o-chip"
          aria-pressed={!custom && value === o}
          onClick={() => {
            setCustom(false);
            onChange(o);
          }}
        >
          {o} {unit}
        </button>
      ))}
      <button className="o-chip" aria-pressed={custom} onClick={() => setCustom(true)}>
        Custom
      </button>
      {custom && (
        <label className="o-custom-num">
          <input
            type="number"
            min={limits.min}
            max={limits.max}
            value={draft}
            aria-label={`${label} (custom)`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = Math.min(limits.max, Math.max(limits.min, Math.round(Number(draft) || value)));
              setDraft(String(n));
              onChange(n);
            }}
          />
          {unit}
        </label>
      )}
    </div>
  );
}

function BreaksSection({ snap }: { snap: Snapshot }) {
  const { settings, state } = snap;
  const now = useNow(settings.breakEnabled);
  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <section id="breaks" className="o-section">
      <h2>Break reminders</h2>
      <div className="o-card o-setting">
        <div>
          <strong>Remind me to take breaks</strong>
          <p>
            A dismissible notification with Snooze and Skip. During the break your sound pauses and then resumes on
            its own.
          </p>
        </div>
        <Toggle
          id="breaks-toggle"
          label="Remind me to take breaks"
          checked={settings.breakEnabled}
          onChange={(v) => void update({ breakEnabled: v })}
        />
      </div>
      <div className="o-card o-break-config" aria-disabled={!settings.breakEnabled}>
        <div className="o-field">
          <span className="o-field-label">Every</span>
          <NumberChoice
            label="Break interval"
            value={settings.breakIntervalMin}
            options={INTERVALS}
            limits={BREAK_INTERVAL_LIMITS}
            unit="min"
            onChange={(v) => void update({ breakIntervalMin: v })}
          />
        </div>
        <div className="o-field">
          <span className="o-field-label">For</span>
          <NumberChoice
            label="Break length"
            value={settings.breakLengthMin}
            options={LENGTHS}
            limits={BREAK_LENGTH_LIMITS}
            unit="min"
            onChange={(v) => void update({ breakLengthMin: v })}
          />
        </div>
        {settings.breakEnabled && (
          <p className="o-next" data-testid="next-break">
            {state.breakActive && state.breakEndsAt
              ? `On a break until ${time(state.breakEndsAt)}.`
              : state.nextBreakAt
                ? `Next break at ${time(state.nextBreakAt)} (in ${Math.max(0, Math.ceil((state.nextBreakAt - now) / 60000))} min).`
                : null}
          </p>
        )}
      </div>
    </section>
  );
}

function ShortcutSection() {
  const shortcut = useShortcut();
  return (
    <section id="shortcut" className="o-section">
      <h2>Keyboard shortcut</h2>
      <div className="o-card o-setting">
        <div>
          <strong>Play / pause</strong>
          <p>Works whenever a Chrome window is focused, without opening the popup.</p>
        </div>
        <div className="o-shortcut">
          {shortcut ? <Kbd>{shortcut}</Kbd> : <span className="o-muted">Not set</span>}
          <button className="btn" onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            Change
          </button>
        </div>
      </div>
    </section>
  );
}

function PrivacySection() {
  return (
    <section id="privacy" className="o-section">
      <h2>Privacy &amp; FAQ</h2>
      <div className="o-card o-faq">
        <details open>
          <summary>Does FocusMask collect any data?</summary>
          <p>
            No. There are no accounts, analytics or servers. Your preferences are saved in Chrome’s storage (and
            synced between your own Chrome profiles if you use Chrome Sync). Uploaded audio files never leave this
            device.
          </p>
        </details>
        <details>
          <summary>Why doesn’t it pause for my Zoom/Teams call?</summary>
          <p>
            It can only see browser tabs. If you use the desktop app, press the shortcut or click the toolbar button
            when a call starts.
          </p>
        </details>
        <details>
          <summary>Why did it pause when nothing important was playing?</summary>
          <p>
            Any audible tab counts — including ads, notification chimes longer than a second or two, and autoplaying
            videos. Mute that tab (right-click its tab → Mute site) and FocusMask will ignore it, or turn auto-pause off.
          </p>
        </details>
        <details>
          <summary>Which sound should I use?</summary>
          <p>
            For voices and conversations, brown noise masks best. Pink noise is a good all-rounder. Nature sounds are
            less effective at masking but nicer for long sessions.
          </p>
        </details>
        <details>
          <summary>Does the sound keep playing if I close the popup?</summary>
          <p>Yes. Playback runs in the background until you pause it or close Chrome.</p>
        </details>
      </div>
    </section>
  );
}
