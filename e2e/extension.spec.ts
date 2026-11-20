import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audible, badge, DIST, expect, noisyTab, restartWorker, silent, test } from './fixtures';
import { BUILTIN_SOUNDS } from '../src/shared/sounds';

test.describe.configure({ mode: 'serial' });

test('install: service worker runs, onboarding tab opens, no tabs permission requested', async ({ ext }) => {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.host_permissions).toBeUndefined();

  const welcome = ext.ctx.pages().find((p) => p.url().includes('options.html?welcome=1'))
    ?? (await ext.ctx.waitForEvent('page', { predicate: (p) => p.url().includes('options.html?welcome=1') }));
  await expect(welcome.getByText('Welcome to FocusMask')).toBeVisible();
  await welcome.getByRole('button', { name: /Got it/ }).click();
  await expect(welcome.getByText('Welcome to FocusMask')).toBeHidden();
  await expect.poll(async () => (await ext.state()).settings.onboarded).toBe(true);
});

test('popup: play starts real audio that survives the popup closing', async ({ ext }) => {
  const popup = await ext.ctx.newPage();
  await popup.goto(ext.url('popup.html'));
  await expect(popup.getByTestId('status')).toHaveText(/Paused/);
  await popup.getByTestId('toggle').click();
  await expect(popup.getByTestId('status')).toHaveText(/Playing/);
  await ext.waitAudio(audible);
  await popup.close();
  await new Promise((r) => setTimeout(r, 1500));
  const s = await ext.waitAudio(audible);
  expect(s?.soundId).toBe('brown');
  expect(s?.contextState).toBe('running');

  // Pause via the same toggle path the shortcut uses.
  await ext.msg({ type: 'toggle' });
  await ext.waitAudio(silent);
});

test('every built-in sound synthesizes and plays', async ({ ext }) => {
  for (const s of BUILTIN_SOUNDS) {
    await ext.msg({ type: 'select', soundId: s.id, play: true });
    const st = await ext.waitAudio((a) => audible(a) && a?.soundId === s.id, 20000);
    expect(st?.error).toBeNull();
  }
});

test('volume changes apply live and persist', async ({ ext }) => {
  await ext.msg({ type: 'play' });
  await ext.waitAudio(audible);
  await ext.msg({ type: 'volume', volume: 1, persist: true });
  await new Promise((r) => setTimeout(r, 800));
  const loud = (await ext.audio())!.rms;
  await ext.msg({ type: 'volume', volume: 0.2, persist: true });
  await new Promise((r) => setTimeout(r, 800));
  const quiet = (await ext.audio())!.rms;
  expect(quiet).toBeLessThan(loud * 0.25);
  expect((await ext.state()).settings.volume).toBe(0.2);
});

test('auto-pause: another audible tab pauses, quiet resumes; muted tabs and toggle-off are ignored', async ({ ext }) => {
  await ext.msg({ type: 'select', soundId: 'pink', play: true });
  await ext.waitAudio(audible);

  const tab = await noisyTab(ext.ctx);
  const paused = await ext.waitState((s) => s.tabAudible, 15000);
  expect(paused.manual).toBe(false);
  await ext.waitAudio(silent);

  await tab.stop();
  await ext.waitState((s) => !s.tabAudible, 15000);
  await ext.waitAudio(audible);
  await tab.page.close();

  // Muted tab: ignored.
  const muted = await noisyTab(ext.ctx);
  await ext.sw.evaluate(async () => {
    const [t] = await chrome.tabs.query({ title: 'noisy' });
    // Without the tabs permission, title is hidden; fall back to the most recent non-extension tab.
    const tabs = await chrome.tabs.query({});
    const target = t ?? tabs.filter((x) => x.id !== undefined).at(-1);
    await chrome.tabs.update(target!.id!, { muted: true });
  });
  await new Promise((r) => setTimeout(r, 4000));
  expect((await ext.state()).state.tabAudible).toBe(false);
  expect(audible(await ext.audio())).toBe(true);
  await muted.page.close();

  // Setting off: ignored.
  await ext.msg({ type: 'settings', patch: { autoPause: false } });
  const loud = await noisyTab(ext.ctx);
  await new Promise((r) => setTimeout(r, 4000));
  expect(audible(await ext.audio())).toBe(true);
  await loud.page.close();
  await ext.msg({ type: 'settings', patch: { autoPause: true } });
});

test('pressing play during an audible tab overrides auto-pause', async ({ ext }) => {
  await ext.msg({ type: 'play' });
  const tab = await noisyTab(ext.ctx);
  await ext.waitState((s) => s.tabAudible);
  await ext.waitAudio(silent);
  await ext.msg({ type: 'play' });
  await ext.waitAudio(audible);
  await new Promise((r) => setTimeout(r, 3000));
  expect(audible(await ext.audio())).toBe(true);
  await tab.page.close();
});

test('break reminder: pauses for the break, notifies, resumes after; play ends break early', async ({ ext }) => {
  await ext.msg({ type: 'select', soundId: 'rain', play: true });
  await ext.waitAudio(audible);
  const { state } = await ext.msg({ type: 'settings', patch: { breakEnabled: true, breakIntervalMin: 30, breakLengthMin: 5 } });
  expect(state.nextBreakAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  const alarm = await ext.sw.evaluate(() => chrome.alarms.get('break-start'));
  expect(alarm?.scheduledTime).toBeGreaterThan(Date.now() + 29 * 60_000);

  // Fast-forward: fire the break now (unpacked extensions allow short alarms).
  await ext.sw.evaluate(() => chrome.alarms.create('break-start', { when: Date.now() + 200 }));
  const onBreak = await ext.waitState((s) => s.breakActive);
  expect(onBreak.breakEndsAt).toBeGreaterThan(Date.now() + 4 * 60_000);
  await ext.waitAudio(silent);
  const notifs = await ext.sw.evaluate(() => chrome.notifications.getAll());
  expect(Object.keys(notifs)).toContain('focusmask-break');

  // Break ends on its timer -> resumes and schedules the next one.
  await ext.sw.evaluate(() => chrome.alarms.create('break-end', { when: Date.now() + 200 }));
  const after = await ext.waitState((s) => !s.breakActive && !!s.nextBreakAt);
  expect(after.nextBreakAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  await ext.waitAudio(audible);

  // Next break; user presses play mid-break -> break ends early.
  await ext.sw.evaluate(() => chrome.alarms.create('break-start', { when: Date.now() + 200 }));
  await ext.waitState((s) => s.breakActive);
  await ext.waitAudio(silent);
  await ext.msg({ type: 'play' });
  await ext.waitState((s) => !s.breakActive && !!s.nextBreakAt);
  await ext.waitAudio(audible);
  expect(await ext.sw.evaluate(() => chrome.alarms.get('break-end'))).toBeFalsy();

  // Break while manually paused: notification still fires, nothing resumes afterwards.
  await ext.msg({ type: 'pause' });
  await ext.sw.evaluate(() => chrome.alarms.create('break-start', { when: Date.now() + 200 }));
  await ext.waitState((s) => s.breakActive);
  await ext.sw.evaluate(() => chrome.alarms.create('break-end', { when: Date.now() + 200 }));
  const end = await ext.waitState((s) => !s.breakActive);
  expect(end.manual).toBe(true);
  expect(silent(await ext.audio())).toBe(true);

  // Disabling clears alarms.
  await ext.msg({ type: 'settings', patch: { breakEnabled: false } });
  expect(await ext.sw.evaluate(() => chrome.alarms.getAll())).toEqual([]);
  expect((await ext.state()).state.nextBreakAt).toBeNull();
});

test('keyboard shortcut is registered', async ({ ext }) => {
  const cmds = await ext.sw.evaluate(() => chrome.commands.getAll());
  const toggle = cmds.find((c) => c.name === 'toggle-playback');
  expect(toggle?.shortcut).toMatch(/Alt\+Shift\+M/);
});

test('options page: library cards and settings UI drive the real extension', async ({ ext }) => {
  const page = await ext.ctx.newPage();
  await page.goto(ext.url('options.html'));
  await page.getByRole('button', { name: /Ocean/ }).click();
  await ext.waitAudio((a) => audible(a) && a?.soundId === 'ocean');
  await page.locator('#autopause-toggle').click();
  await expect.poll(async () => (await ext.state()).settings.autoPause).toBe(false);
  await page.locator('#autopause-toggle').click();
  await page.locator('#breaks-toggle').click();
  await expect(page.getByTestId('next-break')).toHaveText(/Next break at/);
  await page.getByRole('group', { name: 'Break interval' }).getByRole('button', { name: '25 min' }).click();
  await expect.poll(async () => (await ext.state()).settings.breakIntervalMin).toBe(25);
  await expect(page.getByTestId('next-break')).toHaveText(/in 2[45] min/);
});

test('toolbar badge + tooltip reflect playing, auto-pause, break and paused', async ({ ext }) => {
  await expect.poll(async () => (await badge(ext)).text).toBe('');
  await ext.msg({ type: 'select', soundId: 'rain', play: true });
  await expect.poll(() => badge(ext)).toEqual({ text: 'ON', title: 'FocusMask — Playing Rain' });

  const tab = await noisyTab(ext.ctx);
  await expect.poll(async () => (await badge(ext)).text).toBe('II');
  expect((await badge(ext)).title).toMatch(/Auto-paused/);
  await tab.page.close();
  await expect.poll(async () => (await badge(ext)).text).toBe('ON');

  await ext.msg({ type: 'settings', patch: { breakEnabled: true } });
  await ext.sw.evaluate(() => chrome.alarms.create('break-start', { when: Date.now() + 200 }));
  await expect.poll(async () => (await badge(ext)).text).toBe('BRK');
  await ext.msg({ type: 'endBreak' });
  await expect.poll(async () => (await badge(ext)).text).toBe('ON');

  await ext.msg({ type: 'pause' });
  await expect.poll(() => badge(ext)).toEqual({ text: '', title: 'FocusMask — Paused' });
  await ext.msg({ type: 'settings', patch: { breakEnabled: false } });
});

test('worker restart after reload/update: pending break alarm is adopted, not shown as "Breaks off"', async ({ ext }) => {
  const { state } = await ext.msg({ type: 'settings', patch: { breakEnabled: true, breakIntervalMin: 45 } });
  const scheduled = state.nextBreakAt;
  expect(scheduled).toBeGreaterThan(Date.now() + 44 * 60_000);

  await restartWorker(ext, { wipeSession: true });
  const after = await ext.waitState((s) => s.nextBreakAt !== null, 5000);
  expect(after.nextBreakAt).toBe(scheduled);
  expect((await ext.sw.evaluate(() => chrome.alarms.get('break-start')))?.scheduledTime).toBe(scheduled);

  // Popup shows the countdown rather than "Breaks off".
  const popup = await ext.ctx.newPage();
  await popup.goto(ext.url('popup.html'));
  await expect(popup.getByText(/Next break in 4[45] min/)).toBeVisible();
  await popup.close();
});

test('worker restart with an active break whose end alarm was lost: break ends instead of sticking', async ({ ext }) => {
  await ext.msg({ type: 'select', soundId: 'brown', play: true });
  await ext.msg({ type: 'settings', patch: { breakEnabled: true, breakIntervalMin: 30 } });
  await ext.sw.evaluate(() => chrome.alarms.create('break-start', { when: Date.now() + 200 }));
  await ext.waitState((s) => s.breakActive);
  await ext.waitAudio(silent);

  // Lose the end alarm and pretend the break should already be over.
  await ext.helper.evaluate(async () => {
    await chrome.alarms.clear('break-end');
    const { runtime } = await chrome.storage.session.get('runtime');
    await chrome.storage.session.set({ runtime: { ...(runtime as object), breakEndsAt: Date.now() - 1000 } });
  });
  await restartWorker(ext);
  const s = await ext.waitState((st) => !st.breakActive, 5000);
  expect(s.nextBreakAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  await ext.waitAudio(audible);
});

const fireIdle = (ext: { sw: import('@playwright/test').Worker }, s: 'locked' | 'active') =>
  ext.sw.evaluate((st) => {
    (chrome.idle.onStateChanged as unknown as { dispatch: (s: string) => void }).dispatch(st);
  }, s);

test('screen lock pauses with a fade and unlock resumes; setting off ignores it', async ({ ext }) => {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).toContain('idle');

  await ext.msg({ type: 'select', soundId: 'brown', play: true });
  await ext.waitAudio(audible);
  await fireIdle(ext, 'locked');
  const locked = await ext.waitState((s) => s.screenLocked);
  expect(locked.manual).toBe(false);
  await ext.waitAudio(silent);
  await expect.poll(() => badge(ext)).toEqual({ text: 'II', title: 'FocusMask — Paused while your screen is locked' });

  await fireIdle(ext, 'active');
  await ext.waitState((s) => !s.screenLocked);
  await ext.waitAudio(audible);

  await ext.msg({ type: 'settings', patch: { pauseOnLock: false } });
  await fireIdle(ext, 'locked');
  await ext.waitState((s) => s.screenLocked);
  await new Promise((r) => setTimeout(r, 1000));
  expect(audible(await ext.audio())).toBe(true);
  await fireIdle(ext, 'active');
  await ext.msg({ type: 'settings', patch: { pauseOnLock: true } });
});

test('sleep timer: counts down in the popup, pauses when it fires, manual pause cancels it', async ({ ext }) => {
  await ext.msg({ type: 'select', soundId: 'pink', play: true });
  await ext.waitAudio(audible);

  const popup = await ext.ctx.newPage();
  await popup.goto(ext.url('popup.html'));
  await popup.getByRole('button', { name: 'Pause after 30 minutes' }).click();
  await expect(popup.getByTestId('sleep-status')).toHaveText(/Pauses in (30:00|29:5\d)/);
  const { state } = await ext.state();
  expect(state.sleepMin).toBe(30);
  const alarm = await ext.sw.evaluate(() => chrome.alarms.get('sleep-timer'));
  expect(alarm?.scheduledTime).toBe(state.sleepEndsAt);

  // Fast-forward: fire it now.
  await ext.sw.evaluate(() => chrome.alarms.create('sleep-timer', { when: Date.now() + 200 }));
  const fired = await ext.waitState((s) => s.manual && s.sleepEndsAt === null);
  expect(fired.sleepMin).toBeNull();
  await ext.waitAudio(silent);
  await expect(popup.getByTestId('sleep-status')).toHaveText('Off');
  await expect(popup.getByTestId('status')).toHaveText(/Paused/);

  // Set again, then pause manually: alarm is cleared.
  await ext.msg({ type: 'play' });
  await ext.msg({ type: 'sleepTimer', minutes: 15 });
  expect(await ext.sw.evaluate(() => chrome.alarms.get('sleep-timer'))).toBeTruthy();
  await popup.getByTestId('toggle').click();
  await ext.waitState((s) => s.manual && s.sleepEndsAt === null);
  expect(await ext.sw.evaluate(() => chrome.alarms.get('sleep-timer'))).toBeFalsy();

  // Survives a worker restart.
  await ext.msg({ type: 'play' });
  const { state: s2 } = await ext.msg({ type: 'sleepTimer', minutes: 60 });
  await restartWorker(ext);
  expect((await ext.state()).state.sleepEndsAt).toBe(s2.sleepEndsAt);
  await popup.close();
});
