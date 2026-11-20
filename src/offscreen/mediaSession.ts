import type { MediaSessionConfig } from '../shared/types';

export type MediaKeyAction = 'play' | 'pause';

const ANCHOR_SEC = 10;
const ANCHOR_RATE = 8000;

/**
 * 16-bit mono silent WAV. Chrome only creates a controllable media session for an
 * HTMLMediaElement with an audio track lasting ≥5s; Web Audio playback alone never gets one.
 */
export function silentWav(seconds = ANCHOR_SEC, rate = ANCHOR_RATE): Blob {
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Exposes FocusMask to the OS media controls (headphone button, keyboard media keys,
 * MPRIS / SMTC / Now Playing) via a silent looping "anchor" element.
 *
 * The session is claimed only while enabled; the worker disables it whenever another
 * tab is audible so the key reaches that tab instead. After a pause the session stays
 * (paused) so the same button resumes us, until Chrome reclaims the silent document.
 */
export class MediaKeySession {
  private el: HTMLAudioElement | null = null;
  private url: string | null = null;
  private config: MediaSessionConfig = { enabled: false, title: '' };
  private playing = false;

  constructor(
    private onAction: (action: MediaKeyAction) => void,
    private ms: MediaSession | undefined = navigator.mediaSession,
    private makeAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src),
  ) {}

  configure(config: MediaSessionConfig) {
    this.config = config;
    this.sync();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.sync();
  }

  get claimed() {
    return this.el !== null;
  }

  private sync() {
    if (!this.ms || !this.config.enabled) return this.release();
    if (this.playing) {
      this.claim();
      this.ms.metadata = new MediaMetadata({
        title: this.config.title,
        artist: 'FocusMask',
        artwork: [{ src: chrome.runtime.getURL('icons/icon-128.png'), sizes: '128x128', type: 'image/png' }],
      });
      this.ms.playbackState = 'playing';
      // Present as a live stream so OS overlays don't show the anchor's 10s loop as a track length.
      try {
        this.ms.setPositionState?.({ duration: Infinity });
      } catch {
        /* unsupported */
      }
      this.el!.play().catch((e: unknown) => console.warn('[FocusMask] media session anchor', e));
    } else if (this.el) {
      // Keep the (paused) session so the same button can resume.
      this.el.pause();
      this.ms.playbackState = 'paused';
    }
  }

  private claim() {
    if (this.el || !this.ms) return;
    this.url ??= URL.createObjectURL(silentWav());
    const el = this.makeAudio(this.url);
    el.loop = true;
    this.el = el;
    this.ms.setActionHandler('play', () => this.onAction('play'));
    this.ms.setActionHandler('pause', () => this.onAction('pause'));
    this.ms.setActionHandler('stop', () => this.onAction('pause'));
  }

  private release() {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
      this.el = null;
    }
    if (!this.ms) return;
    for (const a of ['play', 'pause', 'stop'] as const) this.ms.setActionHandler(a, null);
    this.ms.metadata = null;
    this.ms.playbackState = 'none';
  }
}
