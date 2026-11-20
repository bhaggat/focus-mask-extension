// Renders extension icons (public/icons) from scripts/brand.mjs using Playwright's Chromium.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logoSvg } from './brand.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'public/icons');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

for (const size of [16, 32, 48, 128]) {
  // Small sizes use the bolder, simplified glyph so it stays legible in the toolbar.
  await render(logoSvg({ size, simple: size <= 32 }), size, resolve(out, `icon-${size}.png`));
}
writeFileSync(resolve(out, 'icon.svg'), logoSvg());
await browser.close();
console.log('icons written to', out);
