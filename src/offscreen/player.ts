import { getCustomSound } from '../shared/db';
import { isCustomId } from '../shared/sounds';
import type { ChimeKind, CustomSoundRecord, OffscreenStatus } from '../shared/types';
import { loopModeFor } from './loopMode';
import { generate } from './synth';

const FADE_SEC = 0.6;
/** Decoded loops are ~5–17 MB each; keep only the most recent few. */
const MAX_CACHED = 2;

/**
 * Single active sound at a time. Built-in sounds are synthesized into an
 * AudioBuffer (cached); custom sounds play through a looping <audio> element.
 * Both route through one master gain for volume + fades, and an analyser so
 * we can report whether audio is actually flowing.
 */
export class Player {
  private ctx = new AudioContext({ latencyHint: 'playback' });
  private master = this.ctx.createGain();
  private analyser = this.ctx.createAnalyser();
  private buffers = new Map<string, AudioBuffer>();
  private source: { stop(): void } | null = null;
  private currentId: string | null = null;
  private playing = false;
  private volume = 0.5;
  private error: string | null = null;
  private loadToken = 0;
  private lastChime: ChimeKind | null = null;

  constructor() {
    this.master.gain.value = 0;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.fftSize = 2048;
  }

  private remember(id: string, buf: AudioBuffer): AudioBuffer {
    // Refresh LRU position and evict the oldest.
    this.buffers.delete(id);
    this.buffers.set(id, buf);
    while (this.buffers.size > MAX_CACHED) this.buffers.delete(this.buffers.keys().next().value!);
    return buf;
  }

  private builtinBuffer(id: string): AudioBuffer {
    const cached = this.buffers.get(id);
    if (cached) return this.remember(id, cached);
    const { left, right } = generate(id, this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
    buf.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    return this.remember(id, buf);
  }

  /**
   * Buffer to loop for `id`, or null when it should stream through `<audio loop>`
   * (long/unknown-length custom files, or ones decodeAudioData can't handle).
   */
  private async loadBuffer(id: string, rec?: CustomSoundRecord): Promise<AudioBuffer | null> {
    if (!isCustomId(id)) return this.builtinBuffer(id);
    const cached = this.buffers.get(id);
    if (cached) return this.remember(id, cached);
    if (!rec || loopModeFor(rec.duration) !== 'buffer') return null;
    try {
      return this.remember(id, await this.ctx.decodeAudioData(await rec.blob.arrayBuffer()));
    } catch (e) {
      console.warn('[FocusMask] decode failed, streaming instead', e);
      return null;
    }
  }

  private loopBuffer(buf: AudioBuffer): { stop(): void } {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.master);
    src.start();
    return { stop: () => { src.stop(); src.disconnect(); } };
  }

  private async startSource(id: string): Promise<{ stop(): void }> {
    if (!isCustomId(id)) return this.loopBuffer(this.builtinBuffer(id));
    const rec = await getCustomSound(id);
    if (!rec) throw new Error('This custom sound no longer exists.');
    const buf = await this.loadBuffer(id, rec);
    if (buf) return this.loopBuffer(buf);
    const url = URL.createObjectURL(rec.blob);
    const el = new Audio(url);
    el.loop = true;
    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.master);
    const stop = () => {
      el.pause();
      node.disconnect();
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
    };
    try {
      await el.play();
    } catch (e) {
      stop();
      throw e;
    }
    return { stop };
  }

  private ramp(to: number) {
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + FADE_SEC);
  }

  /** Perceptual curve so the slider feels linear. */
  private gainFor(v: number) {
    return v * v;
  }

  /** Resolves false when a later play/pause superseded this call (nothing new started). */
  async play(id: string, volume: number): Promise<boolean> {
    this.volume = volume;
    this.error = null;
    const token = ++this.loadToken;
    await this.ctx.resume();
    if (this.currentId !== id || !this.source) {
      // Synthesize before fading out the old sound so the gap stays short.
      if (!isCustomId(id)) this.builtinBuffer(id);
      const old = this.source;
      if (old && this.playing) {
        this.ramp(0);
        await new Promise((r) => setTimeout(r, FADE_SEC * 1000));
      }
      old?.stop();
      this.source = null;
      try {
        const src = await this.startSource(id);
        if (token !== this.loadToken) {
          src.stop();
          return false;
        }
        this.source = src;
        this.currentId = id;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.playing = false;
        this.currentId = null;
        throw e;
      }
    }
    if (token !== this.loadToken) return false;
    this.playing = true;
    this.ramp(this.gainFor(this.volume));
    return true;
  }

  pause() {
    this.loadToken++;
    this.playing = false;
    this.ramp(0);
    const src = this.source;
    // Stop the source once faded so the document goes silent and Chrome may reclaim it.
    setTimeout(() => {
      if (!this.playing && this.source === src) {
        src?.stop();
        this.source = null;
        this.currentId = null;
      }
    }, FADE_SEC * 1000 + 50);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.playing) {
      const g = this.master.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(this.gainFor(v), now, 0.03);
    }
  }

  /**
   * Two-note heads-up before a break transition: falling before a pause, rising before a resume.
   * Routed straight to the destination — the master gain is at 0 during a break.
   */
  chime(kind: ChimeKind, volume: number) {
    void this.ctx.resume();
    const [a, b] = kind === 'pause' ? [659.25, 440] : [440, 659.25]; // E5→A4 / A4→E5
    const peak = Math.max(0.05, 0.25 * this.gainFor(volume));
    const t0 = this.ctx.currentTime + 0.02;
    [a, b].forEach((freq, i) => {
      const start = t0 + i * 0.2;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(env).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
      osc.onended = () => env.disconnect();
    });
    this.lastChime = kind;
  }

  status(): OffscreenStatus {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const x of data) sum += x * x;
    return {
      soundId: this.currentId,
      playing: this.playing,
      contextState: this.ctx.state,
      rms: Math.sqrt(sum / data.length),
      error: this.error,
      lastChime: this.lastChime,
    };
  }
}
