import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audible, badge, expect, launch, openExt, silent, sineWav, test } from './fixtures';

test('custom uploads: add, play, survive restart, reject bad files, delete', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'focusmask-e2e-up-'));
  const files = mkdtempSync(join(tmpdir(), 'focusmask-files-'));
  const wav = join(files, 'my_cafe-loop.wav');
  writeFileSync(wav, sineWav(3));
  const fake = join(files, 'broken.mp3');
  writeFileSync(fake, 'definitely not audio');
  const pdf = join(files, 'notes.pdf');
  writeFileSync(pdf, '%PDF-1.4');

  try {
    let ctx = await launch(profile);
    let ext = await openExt(ctx);
    let page = await ctx.newPage();
    await page.goto(ext.url('options.html'));

    await page.getByTestId('upload-input').setInputFiles([wav, fake, pdf]);
    await expect(page.getByTestId('custom-list')).toContainText('my cafe loop');
    await expect(page.getByTestId('custom-list')).toContainText('0:03');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('couldn’t be decoded');
    await expect(alert).toContainText('isn\'t a supported format');
    await expect(page.getByTestId('custom-list').locator('li')).toHaveCount(1);

    await page.getByRole('button', { name: 'Play my cafe loop' }).click();
    const st = await ext.waitAudio(audible);
    expect(st?.soundId).toMatch(/^custom:/);
    const customId = st!.soundId!;

    // The popup lists it too.
    const popup = await ctx.newPage();
    await popup.goto(ext.url('popup.html'));
    await expect(popup.getByText('My sounds')).toBeVisible();
    await expect(popup.getByTestId('sound-name')).toHaveText('my cafe loop');
    await ctx.close();

    // Restart the browser with the same profile.
    ctx = await launch(profile);
    ext = await openExt(ctx);
    const { state, settings } = await ext.state();
    expect(state.manual).toBe(true); // never auto-plays on startup
    expect(settings.soundId).toBe(customId);
    expect(state.soundId).toBe(customId);
    page = await ctx.newPage();
    page.on('dialog', (d) => void d.accept());
    await page.goto(ext.url('options.html'));
    await expect(page.getByTestId('custom-list')).toContainText('my cafe loop');

    await ext.msg({ type: 'play' });
    await ext.waitAudio((a) => audible(a) && a?.soundId === customId);

    await page.getByRole('button', { name: 'Delete my cafe loop' }).click();
    await expect(page.getByText('No custom sounds yet.')).toBeVisible();
    const after = await ext.waitState((s) => s.soundId === 'brown');
    expect(after.manual).toBe(true);
    await ext.waitAudio(silent);
    await ctx.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
    rmSync(files, { recursive: true, force: true });
  }
});

test('custom uploads: newly supported formats (Opus/WebM recorded in-browser) decode and play', async ({ ext }) => {
  const page = await ext.ctx.newPage();
  await page.goto(ext.url('options.html'));
  // Record ~1.5 s of tone to a real WebM/Opus file using the browser's own encoder.
  const bytes = await page.evaluate(async () => {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, 1500));
    rec.stop();
    await done;
    await ac.close();
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await page.getByTestId('upload-input').setInputFiles({ name: 'tone.webm', mimeType: 'audio/webm', buffer: Buffer.from(bytes) });
  await expect(page.getByTestId('custom-list')).toContainText('tone');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play tone' }).click();
  const st = await ext.waitAudio(audible);
  expect(st?.soundId).toMatch(/^custom:/);
});

test('custom uploads: rename updates the list, popup and toolbar tooltip, and it still plays', async ({ ext }) => {
  const files = mkdtempSync(join(tmpdir(), 'focusmask-files-'));
  const wav = join(files, 'take_3-final.wav');
  writeFileSync(wav, sineWav(2));
  try {
    const page = await ext.ctx.newPage();
    await page.goto(ext.url('options.html'));
    await page.getByTestId('upload-input').setInputFiles(wav);
    await page.getByRole('button', { name: 'Play take 3 final' }).click();
    await ext.waitAudio(audible);
    await expect.poll(async () => (await badge(ext)).title).toBe('FocusMask — Playing take 3 final');

    await page.getByRole('button', { name: 'Rename take 3 final' }).click();
    await page.getByRole('textbox', { name: 'New name for take 3 final' }).fill('Thunderstorm');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('custom-list')).toContainText('Thunderstorm');
    await expect.poll(async () => (await badge(ext)).title).toBe('FocusMask — Playing Thunderstorm');

    const popup = await ext.ctx.newPage();
    await popup.goto(ext.url('popup.html'));
    await expect(popup.getByTestId('sound-name')).toHaveText('Thunderstorm');
    expect(audible(await ext.audio())).toBe(true);

    // Survives a reload of the page (persisted in IndexedDB).
    await page.reload();
    await expect(page.getByTestId('custom-list')).toContainText('Thunderstorm');
  } finally {
    rmSync(files, { recursive: true, force: true });
  }
});

