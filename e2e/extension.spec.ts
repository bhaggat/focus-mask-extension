import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { audible, DIST, expect, noisyTab, silent, test } from './fixtures';
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
