// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script, no type declarations
import { buildSite } from '../scripts/site.mjs';

const dirs: string[] = [];
async function build(storeUrl = '') {
  const out = mkdtempSync(join(tmpdir(), 'focusmask-site-'));
  dirs.push(out);
  await buildSite(out, { storeUrl });
  return out;
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('landing site build', () => {
  it('emits every page, the stylesheet, icon, screenshots and CNAME', async () => {
    const out = await build();
    for (const f of [
      'index.html',
      'privacy-policy/index.html',
      'support/index.html',
      '404.html',
      'CNAME',
      'assets/site.css',
      'assets/icon-128.png',
      'assets/screenshots/1-one-click.png',
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(readFileSync(join(out, 'CNAME'), 'utf8').trim()).toBe('focusmask.bhaggat.in');
  });

  it('has no placeholders and lists the support contact', async () => {
    const out = await build();
    for (const f of files(out).filter((f) => /\.(html|css)$/.test(f))) {
      const src = readFileSync(f, 'utf8');
      expect(src, relative(out, f)).not.toContain('CONTACT_EMAIL');
      expect(src, relative(out, f)).not.toContain('{{');
      expect(src, relative(out, f)).not.toContain('STORE_CTA');
    }
    for (const f of ['privacy-policy/index.html', 'support/index.html']) {
      expect(readFileSync(join(out, f), 'utf8')).toContain('dhruvbhagat98@gmail.com');
    }
  });

  it('loads no third-party scripts and every local link resolves', async () => {
    const out = await build();
    for (const f of files(out).filter((f) => f.endsWith('.html'))) {
      const src = readFileSync(f, 'utf8');
      expect(src, relative(out, f)).not.toMatch(/<script[^>]+src=["']https?:/);
      for (const [, url] of src.matchAll(/(?:href|src)="([^"#?]+)/g)) {
        if (/^(https?:|mailto:)/.test(url)) continue;
        const target = url.startsWith('/') ? join(out, url) : join(dirname(f), url);
        const resolved = url.endsWith('/') ? join(target, 'index.html') : target;
        expect(existsSync(resolved), `${relative(out, f)} → ${url}`).toBe(true);
      }
    }
  });

  it('shows "coming soon" until the store URL is known, then links to it', async () => {
    const soon = readFileSync(join(await build(''), 'index.html'), 'utf8');
    expect(soon).toContain('Coming soon to the Chrome Web Store');
    expect(soon).not.toContain('chromewebstore.google.com');
    const live = readFileSync(join(await build('https://chromewebstore.google.com/detail/abc'), 'index.html'), 'utf8');
    expect(live).toContain('href="https://chromewebstore.google.com/detail/abc"');
  });
});
