import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { OffscreenStatus, RuntimeState, Settings } from '../src/shared/types';

export const DIST = resolve(import.meta.dirname, '../dist');

export async function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    // Playwright mutes by default, which also suppresses Chrome's tab `audible` flag.
    ignoreDefaultArgs: ['--mute-audio'],
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--autoplay-policy=no-user-gesture-required',
      // Fake audio sink: keeps runs silent on the host while audible detection still works.
      '--disable-audio-output',
    ],
  });
}

export async function serviceWorker(ctx: BrowserContext): Promise<Worker> {
  return ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
}

export class Ext {
  constructor(
    public ctx: BrowserContext,
    public sw: Worker,
    public id: string,
    public helper: Page,
  ) {}

  url(path: string) {
    return `chrome-extension://${this.id}/${path}`;
  }

  /** Send a message to the background exactly like the UI does. */
  msg<T = { state: RuntimeState; settings: Settings }>(m: object): Promise<T> {
    return this.helper.evaluate((mm) => chrome.runtime.sendMessage(mm), m) as Promise<T>;
  }

  state() {
    return this.msg({ type: 'getState' });
  }

  audio(): Promise<OffscreenStatus | null> {
    return this.msg<OffscreenStatus | null>({ type: 'audioStatus' });
  }

  /** Poll audio status until predicate holds. */
  async waitAudio(pred: (s: OffscreenStatus | null) => boolean, timeout = 15000): Promise<OffscreenStatus | null> {
    const end = Date.now() + timeout;
    let last: OffscreenStatus | null = null;
    while (Date.now() < end) {
      last = await this.audio();
      if (pred(last)) return last;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`audio condition not met; last=${JSON.stringify(last)}`);
  }

  async waitState(pred: (s: RuntimeState) => boolean, timeout = 15000): Promise<RuntimeState> {
    const end = Date.now() + timeout;
    let last: RuntimeState | null = null;
    while (Date.now() < end) {
      last = (await this.state()).state;
      if (pred(last)) return last;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`state condition not met; last=${JSON.stringify(last)}`);
  }
}

export const audible = (s: OffscreenStatus | null) => !!s && s.playing && s.rms > 0.002;
export const silent = (s: OffscreenStatus | null) => !s || (!s.playing && s.rms < 0.0005);

export async function openExt(ctx: BrowserContext): Promise<Ext> {
  const sw = await serviceWorker(ctx);
  const id = new URL(sw.url()).host;
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${id}/popup.html`);
  return new Ext(ctx, sw, id, helper);
}

export const test = base.extend<{ profileDir: string; ext: Ext }>({
  // eslint-disable-next-line no-empty-pattern
  profileDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'focusmask-e2e-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  ext: async ({ profileDir }, use) => {
    const ctx = await launch(profileDir);
    const ext = await openExt(ctx);
    await use(ext);
    await ctx.close();
  },
});

export { expect } from '@playwright/test';

/** Minimal PCM WAV (mono 16-bit) with a sine tone, for upload tests. */
export function sineWav(seconds = 2, freq = 440, sr = 22050): Buffer {
  const n = Math.floor(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 12000), 44 + i * 2);
  return buf;
}

/** Opens a normal web tab that plays a tone, returning a stop() handle. */
export async function noisyTab(ctx: BrowserContext): Promise<{ page: Page; stop: () => Promise<void> }> {
  const page = await ctx.newPage();
  await page.goto('data:text/html,<title>noisy</title><h1>noisy tab</h1>');
  await page.evaluate(async () => {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    g.gain.value = 0.2;
    osc.connect(g).connect(ac.destination);
    osc.start();
    await ac.resume();
    (window as unknown as { __stop: () => Promise<void> }).__stop = () => ac.close();
  });
  return { page, stop: () => page.evaluate(() => (window as unknown as { __stop: () => Promise<void> }).__stop()) };
}
