// Assembles the landing site (https://focusmask.bhaggat.in) from site/ plus the store
// screenshots and icon into site-dist/. Node built-ins only, so CI needs no npm install.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Chrome Web Store item ID: set once the package is uploaded (dev console → item → ID). */
export const STORE_ITEM_ID = '';

const root = resolve(import.meta.dirname, '..');
const MARKER = '<!-- STORE_CTA -->';

function storeCta(storeUrl) {
  return storeUrl
    ? `<a class="btn btn-primary" href="${storeUrl}" rel="noopener">Add to Chrome — it’s free</a>`
    : '<span class="btn btn-soon" aria-disabled="true">Coming soon to the Chrome Web Store</span>';
}

export async function buildSite(outDir, { storeUrl = STORE_ITEM_ID ? `https://chromewebstore.google.com/detail/${STORE_ITEM_ID}` : '' } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(join(root, 'site'), outDir, { recursive: true });

  const shots = join(outDir, 'assets', 'screenshots');
  mkdirSync(shots, { recursive: true });
  for (const f of readdirSync(join(root, 'store-assets', 'screenshots'))) {
    if (f.endsWith('.png')) cpSync(join(root, 'store-assets', 'screenshots', f), join(shots, f));
  }
  for (const f of ['icon-128.png', 'icon-32.png', 'icon.svg']) cpSync(join(root, 'public', 'icons', f), join(outDir, 'assets', f));

  const index = join(outDir, 'index.html');
  const html = readFileSync(index, 'utf8');
  if (!html.includes(MARKER)) throw new Error(`site/index.html is missing ${MARKER}`);
  writeFileSync(index, html.replaceAll(MARKER, storeCta(storeUrl)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = join(root, 'site-dist');
  await buildSite(out);
  console.log(`✓ site built → ${out}${existsSync(join(out, 'CNAME')) ? ' (CNAME ok)' : ''}`);
}
