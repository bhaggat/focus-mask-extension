import { getCustomSound } from '../shared/db';
import { isCustomId } from '../shared/sounds';
import type { OffscreenStatus } from '../shared/types';
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

  constructor() {
    this.master.gain.value = 0;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.fftSize = 2048;
  }

  private bufferFor(id: string): AudioBuffer {
    let buf = this.buffers.get(id);
    if (!buf) {
      const { left, right } = generate(id, this.ctx.sampleRate);
      buf = this.ctx.createBuffer(2, left.length, this.ctx.sampleRate);
      buf.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    }
    // Refresh LRU position and evict the oldest.
    this.buffers.delete(id);
    this.buffers.set(id, buf);
    while (this.buffers.size > MAX_CACHED) this.buffers.delete(this.buffers.keys().next().value!);
    return buf;
  }

  private async startSource(id: string): Promise<{ stop(): void }> {
    if (!isCustomId(id)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bufferFor(id);
      src.loop = true;
      src.connect(this.master);
      src.start();
      return { stop: () => { src.stop(); src.disconnect(); } };
    }
    const rec = await getCustomSound(id);
    if (!rec) throw new Error('This custom sound no longer exists.');
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

  async play(id: string, volume: number) {
    this.volume = volume;
    this.error = null;
    const token = ++this.loadToken;
    await this.ctx.resume();
    if (this.currentId !== id || !this.source) {
      // Synthesize before fading out the old sound so the gap stays short.
      if (!isCustomId(id)) this.bufferFor(id);
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
          return;
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
    this.playing = true;
    this.ramp(this.gainFor(this.volume));
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
    };
  }
}
