// Generates every Chrome Web Store image into store-assets/ from the REAL built extension.
// Usage: npm run build && npm run assets
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { logoSvg } from './brand.mjs';

const root = resolve(import.meta.dirname, '..');
const DIST = join(root, 'dist');
const OUT = join(root, 'store-assets');
const RAW = mkdtempSync(join(tmpdir(), 'fm-raw-'));
for (const d of ['', 'screenshots', 'promo', 'icon']) mkdirSync(join(OUT, d), { recursive: true });

const FONT = `'Ubuntu Sans', 'Noto Sans', 'Inter', system-ui, sans-serif`;
const b64 = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function sineWav(seconds, freq, sr = 22050) {
  const n = Math.floor(seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 9000), 44 + i * 2);
  return buf;
}

// ---------- 1. Capture raw UI from the real extension ----------
const profile = mkdtempSync(join(tmpdir(), 'fm-assets-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  ignoreDefaultArgs: ['--mute-audio'],
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-audio-output', '--autoplay-policy=no-user-gesture-required'],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const url = (p) => `chrome-extension://${id}/${p}`;
const helper = await ctx.newPage();
await helper.goto(url('popup.html'));
const msg = (m) => helper.evaluate((mm) => chrome.runtime.sendMessage(mm), m);
await msg({ type: 'settings', patch: { onboarded: true } });

async function popupShot(name) {
  const p = await ctx.newPage({ deviceScaleFactor: 2 });
  await p.setViewportSize({ width: 340, height: 300 });
  await p.goto(url('popup.html'));
  await p.waitForSelector('[data-testid=status]');
  await wait(500);
  const el = await p.$('.popup');
  await el.screenshot({ path: join(RAW, `${name}.png`) });
  await p.close();
}

async function optionsShot(name, selector, { prep, height = 900, width = 1000 } = {}) {
  const p = await ctx.newPage({ deviceScaleFactor: 2 });
  await p.setViewportSize({ width, height });
  await p.goto(url('options.html'));
  await p.waitForSelector('#library');
  if (prep) await prep(p);
  await wait(400);
  const boxes = await p.$$eval(selector, (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
    }),
  );
  const x = Math.min(...boxes.map((b) => b.x)) - 16;
  const y = Math.min(...boxes.map((b) => b.y)) - 16;
  const r = Math.max(...boxes.map((b) => b.x + b.w)) + 16;
  const bt = Math.max(...boxes.map((b) => b.y + b.h)) + 16;
  await p.screenshot({ path: join(RAW, `${name}.png`), clip: { x, y, width: r - x, height: bt - y }, fullPage: true });
  await p.close();
}

// Popup: playing brown noise
await msg({ type: 'volume', volume: 0.6, persist: true });
await msg({ type: 'select', soundId: 'brown', play: true });
await msg({ type: 'sleepTimer', minutes: 30 });
await popupShot('popup-playing');
await msg({ type: 'sleepTimer', minutes: null });

// Popup: auto-paused by a meeting tab
const noisy = await ctx.newPage();
await noisy.goto('data:text/html,<title>Meeting</title>');
await noisy.evaluate(async () => {
  const ac = new AudioContext();
  const o = ac.createOscillator();
  o.connect(ac.destination);
  o.start();
  await ac.resume();
});
for (let i = 0; i < 50; i++) {
  const { state } = await msg({ type: 'getState' });
  if (state.tabAudible) break;
  await wait(200);
}
await popupShot('popup-autopaused');
await noisy.close();
await wait(4500);

// Library (with rain playing)
await msg({ type: 'select', soundId: 'rain', play: true });
await optionsShot('library', '#library', { width: 1150 });

// My sounds with a few uploads
const files = mkdtempSync(join(tmpdir(), 'fm-files-'));
const uploads = ['Coffee shop murmur.wav', 'Lofi study loop.wav', 'Thunderstorm.wav'].map((n, i) => {
  const f = join(files, n);
  writeFileSync(f, sineWav(4 + i * 3, 220 + i * 110));
  return f;
});
await optionsShot('mysounds', '#my-sounds', {
  width: 860,
  prep: async (p) => {
    await p.getByTestId('upload-input').setInputFiles(uploads);
    await p.getByTestId('custom-list').locator('li').nth(2).waitFor();
    await p.getByRole('button', { name: 'Play Lofi study loop' }).click();
  },
});

// Auto-pause explanation
await optionsShot('autopause', '#auto-pause');

// Breaks enabled
await msg({ type: 'select', soundId: 'forest', play: true });
await msg({ type: 'settings', patch: { breakEnabled: true, breakIntervalMin: 50, breakLengthMin: 5 } });
await optionsShot('breaks', '#breaks', { width: 860 });
await popupShot('popup-forest');

await ctx.close();
rmSync(profile, { recursive: true, force: true });
rmSync(files, { recursive: true, force: true });

// ---------- 2. Compose store images ----------
const browser = await chromium.launch();
async function render(html, w, h, file, { transparent = false } = {}) {
  const p = await browser.newPage({ deviceScaleFactor: 1 });
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}

const BG = `radial-gradient(1200px 700px at 100% 0%, #d9f4f0 0%, transparent 60%),
  radial-gradient(900px 700px at 0% 100%, #e6e2ff 0%, transparent 60%), #f7f7fc`;

const shell = (body, w = 1280, h = 800) => `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; font-family: ${FONT}; color: #171a2b; background: ${BG}; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 24px; letter-spacing: -0.01em; }
  h1 { font-size: 52px; line-height: 1.08; letter-spacing: -0.03em; margin: 22px 0 18px; font-weight: 800; }
  h1 em { font-style: normal; background: linear-gradient(90deg, #5b4ef0, #20a596); -webkit-background-clip: text; color: transparent; }
  p.lead { font-size: 21px; line-height: 1.45; color: #4d5370; margin: 0 0 26px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
  li { display: flex; gap: 12px; align-items: center; font-size: 18px; color: #2b2f45; font-weight: 500; }
  li::before { content: ''; flex: none; width: 22px; height: 22px; border-radius: 50%;
    background: #5b4ef0 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E") center/14px no-repeat; }
  .shot { border-radius: 18px; box-shadow: 0 2px 6px rgba(30,30,80,.08), 0 30px 70px rgba(40,40,110,.22); display: block; }
  .card { background: #fff; border-radius: 18px; box-shadow: 0 2px 6px rgba(30,30,80,.08), 0 30px 70px rgba(40,40,110,.22); overflow: hidden; }
</style></head><body>${body}</body></html>`;

const logo = (s) => logoSvg({ size: s });

function split({ title, lead, bullets, image, imgW, imgH, extra = '' }) {
  return shell(`
  <div style="display:flex;height:100%;padding:0 72px;align-items:center;gap:64px">
    <div style="flex:1;min-width:0">
      <div class="brand">${logo(40)} FocusMask</div>
      <h1>${title}</h1>
      <p class="lead">${lead}</p>
      <ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    </div>
    <div style="flex:none;position:relative;width:${imgW}px;display:flex;justify-content:center">
      <img class="shot" src="${image}" style="width:${imgW}px;height:${imgH ? imgH + 'px' : 'auto'}" />
      ${extra}
    </div>
  </div>`);
}

const raw = (n) => b64(join(RAW, `${n}.png`));
const shots = join(OUT, 'screenshots');

await render(
  split({
    title: 'Mask distractions in <em>one click</em>',
    lead: 'Brown, pink & white noise plus calming nature sounds — right in your toolbar.',
    bullets: [
      'Keeps playing when the popup closes',
      'Sleep timer: stop after 15 min – 2 h',
      'Generated on your device — works offline',
      'Global shortcut: Alt+Shift+M',
    ],
    image: raw('popup-playing'),
    imgW: 380,
  }),
  1280, 800, join(shots, '1-one-click.png'),
);

await render(
  split({
    title: 'Pauses itself when your <em>meeting starts</em>',
    lead: 'When another browser tab plays audio — Meet, Zoom Web, YouTube — FocusMask steps aside and resumes when it’s quiet.',
    bullets: ['Also pauses while your screen is locked', 'Muted tabs are ignored', 'Honest about limits: browser tabs only'],
    image: raw('popup-autopaused'),
    imgW: 380,
  }),
  1280, 800, join(shots, '2-auto-pause.png'),
);

await render(
  shell(`
  <div style="padding:52px 72px 0;display:flex;flex-direction:column;height:100%">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:40px">
      <div>
        <div class="brand">${logo(40)} FocusMask</div>
        <h1 style="margin-bottom:0">8 sounds, <em>no downloads</em></h1>
      </div>
      <p class="lead" style="max-width:430px;margin:0 0 6px">Every sound is synthesized locally and loops seamlessly — even with no internet.</p>
    </div>
    <div style="flex:1;display:flex;justify-content:center;align-items:flex-start;margin-top:30px;min-height:0">
      <img class="shot" src="${raw('library')}" style="max-width:1136px;max-height:560px" />
    </div>
  </div>`),
  1280, 800, join(shots, '3-library.png'),
);

await render(
  split({
    title: 'Bring <em>your own</em> sounds',
    lead: 'Drop in MP3, WAV, OGG, FLAC or M4A files. They’re stored only on this device and loop continuously.',
    bullets: ['Drag & drop or file picker', 'Rename them anytime', 'Up to 50 MB per file', 'Never uploaded anywhere'],
    image: raw('mysounds'),
    imgW: 620,
  }),
  1280, 800, join(shots, '4-your-sounds.png'),
);

const notif = `
  <div class="card" style="position:absolute;right:-24px;top:-150px;width:400px;padding:16px 18px;display:flex;gap:14px;font-family:${FONT}">
    ${logoSvg({ size: 44 })}
    <div style="min-width:0">
      <div style="font-weight:700;font-size:16px">Time for a short break</div>
      <div style="color:#4d5370;font-size:14px;margin-top:2px;line-height:1.4">Step away for 5 min — stretch, rest your eyes, grab water. Sound is paused and resumes automatically.</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <span style="border:1px solid #e1e4ef;border-radius:8px;padding:5px 10px;font-size:13px;font-weight:600">Snooze 10 min</span>
        <span style="border:1px solid #e1e4ef;border-radius:8px;padding:5px 10px;font-size:13px;font-weight:600">Skip break</span>
      </div>
    </div>
  </div>`;
await render(
  split({
    title: 'Gentle, optional <em>break reminders</em>',
    lead: 'A simple notification every 25–90 minutes. Your sound pauses for the break and resumes on its own.',
    bullets: ['Off by default — never naggy', 'Snooze or skip in one click', 'No full-screen blockers'],
    image: raw('breaks'),
    imgW: 600,
    extra: notif,
  }).replace('align-items:center;gap:64px', 'align-items:center;gap:64px;padding-top:120px'),
  1280, 800, join(shots, '5-breaks.png'),
);

// Small promo tile 440x280
await render(
  shell(
    `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 34px;
      background:linear-gradient(135deg,#5b4ef0 0%,#3a7fd0 55%,#22a99b 100%);color:#fff">
      <div style="display:flex;align-items:center;gap:14px">${logoSvg({ size: 64 })}
        <div style="font-size:34px;font-weight:800;letter-spacing:-0.02em">FocusMask</div></div>
      <div style="font-size:21px;font-weight:600;line-height:1.3;margin-top:18px;opacity:.97">Focus sounds that pause<br/>when your meeting starts</div>
    </div>`,
    440, 280,
  ),
  440, 280, join(OUT, 'promo', 'small-promo-440x280.png'),
);

// Marquee 1400x560
await render(
  shell(
    `<div style="height:100%;display:flex;align-items:center;padding:0 90px;gap:70px;
      background:linear-gradient(135deg,#5b4ef0 0%,#3a7fd0 55%,#22a99b 100%);color:#fff">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:16px">${logoSvg({ size: 72 })}
          <div style="font-size:44px;font-weight:800;letter-spacing:-0.02em">FocusMask</div></div>
        <div style="font-size:46px;font-weight:800;line-height:1.1;letter-spacing:-0.025em;margin-top:26px">Block out the noise.<br/>Step aside for meetings.</div>
        <div style="font-size:21px;margin-top:18px;opacity:.9">White, pink & brown noise · nature sounds · auto-pause · offline</div>
      </div>
      <img src="${raw('popup-forest')}" style="height:500px;border-radius:18px;box-shadow:0 30px 70px rgba(0,0,40,.35)" />
    </div>`,
    1400, 560,
  ),
  1400, 560, join(OUT, 'promo', 'marquee-1400x560.png'),
);

// Store icon: 128x128 with 96x96 artwork + 16px transparent padding (CWS guideline)
await render(
  `<html><body style="margin:0;background:transparent">${logoSvg({ size: 128, pad: 16 })}</body></html>`,
  128, 128, join(OUT, 'icon', 'store-icon-128.png'), { transparent: true },
);

await browser.close();
rmSync(RAW, { recursive: true, force: true });
console.log('Store assets written to', OUT);
