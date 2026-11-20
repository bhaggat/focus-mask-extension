// Validates dist/ against Chrome Web Store basics, then packs release/focusmask-v<version>.zip.
import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const fail = (m) => {
  console.error('✗', m);
  process.exitCode = 1;
};
const ok = (m) => console.log('✓', m);

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json missing — run `npm run build` first');
  process.exit(1);
}
const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p));
  }
};
walk(dist);

// Manifest basics
m.manifest_version === 3 ? ok('Manifest V3') : fail('manifest_version must be 3');
m.version === pkg.version ? ok(`version ${m.version} matches package.json`) : fail(`manifest version ${m.version} != package.json ${pkg.version}`);
m.name.length <= 75 ? ok(`name length ${m.name.length}/75`) : fail('name > 75 chars');
m.description.length <= 132 ? ok(`description length ${m.description.length}/132`) : fail('description > 132 chars');
!m.permissions.includes('tabs') && !m.host_permissions ? ok('no tabs/host permissions') : fail('unexpected broad permissions');

// Referenced files exist
const refs = [
  ...Object.values(m.icons),
  ...Object.values(m.action.default_icon),
  m.action.default_popup,
  m.options_page,
  m.background.service_worker,
  'offscreen.html',
];
const missing = refs.filter((r) => !files.includes(r));
missing.length ? fail(`missing files: ${missing.join(', ')}`) : ok(`all ${refs.length} manifest-referenced files present`);

// No remote code
const remoteScript = /<script[^>]+src=["']https?:|import\s*\(\s*["']https?:|importScripts\(\s*["']https?:/;
const dyn = /\beval\(|new Function\(/;
for (const f of files.filter((f) => /\.(js|html)$/.test(f))) {
  const src = readFileSync(join(dist, f), 'utf8');
  if (remoteScript.test(src)) fail(`remote script reference in ${f}`);
  if (dyn.test(src)) fail(`eval/new Function in ${f}`);
}
ok('no remote scripts, eval or new Function');

const total = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
ok(`${files.length} files, ${(total / 1024).toFixed(0)} KB unpacked`);

if (process.exitCode) process.exit(1);

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `focusmask-v${m.version}.zip`);
const zip = new ZipArchive({ zlib: { level: 9 } });
const stream = createWriteStream(out);
zip.pipe(stream);
zip.directory(dist, false);
await zip.finalize();
await new Promise((r) => stream.on('close', r));
ok(`packed ${relative(root, out)} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
