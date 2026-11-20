import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audible, expect, launch, openExt, silent, sineWav, test } from './fixtures';

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
