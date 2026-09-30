// Photo helper: shrinks photos to phone size and adds them to a pack, several per animal.
//
//   npm run photos -- "<folder with photos>" [--pack animals] [--size 720]
//
// Photos are matched to animals by file name: cat-1.jpg, Cat 2.jpeg, duck_3.png -> cat, duck.
// Files that don't match an animal in the pack are skipped and listed. Photos are resized on this
// PC with Windows' built-in imaging (tools/resize-photos.ps1) and saved as JPEG in
// public/assets/packs/<pack>/photos/. Each matched animal's manifest entry gets an "images" list
// (running it again replaces that animal's photos). The manifest's formatting is left alone.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const folder = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const packId = option('pack', 'animals');
const size = Number(option('size', 720));

if (!folder || !fs.existsSync(folder)) {
  console.error('Usage: npm run photos -- "<folder with photos>" [--pack animals] [--size 720]');
  process.exit(1);
}

const ROOT = process.cwd();
const packDir = path.join(ROOT, 'public', 'assets', 'packs', packId);
const manifestPath = path.join(packDir, 'manifest.json');
let text = fs.readFileSync(manifestPath, 'utf8');
const keys = new Set(JSON.parse(text).items.map((i) => i.item_key));

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare;
const matched = new Map();
const skipped = new Map();
for (const file of fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|bmp|gif)$/i.test(f)).sort(natural)) {
  const key = /^(.+?)[\s_-]*\d*\.[a-z]+$/i.exec(file)[1].trim().toLowerCase();
  if (!keys.has(key)) {
    skipped.set(key, (skipped.get(key) ?? 0) + 1);
    continue;
  }
  if (!matched.has(key)) matched.set(key, []);
  matched.get(key).push(file);
}

if (!matched.size) {
  console.error(`No photos matched an animal in the "${packId}" pack.`);
  process.exit(1);
}

// Resize everything in one PowerShell run.
const jobs = [];
const imagePaths = new Map();
for (const [key, files] of matched) {
  for (const old of fs.existsSync(path.join(packDir, 'photos')) ? fs.readdirSync(path.join(packDir, 'photos')) : []) {
    if (old.startsWith(`${key}_`)) fs.rmSync(path.join(packDir, 'photos', old));
  }
  imagePaths.set(
    key,
    files.map((file, n) => {
      const name = `${key}_${n + 1}.jpg`;
      jobs.push({ src: path.resolve(folder, file), dst: path.join(packDir, 'photos', name) });
      return `${packId}/photos/${name}`;
    }),
  );
}
const listFile = path.join(os.tmpdir(), `ksm-photos-${process.pid}.json`);
fs.writeFileSync(listFile, JSON.stringify(jobs));
try {
  const script = path.join(ROOT, 'tools', 'resize-photos.ps1');
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ListFile', listFile, '-Size', String(size)],
    { encoding: 'utf8' },
  );
  process.stdout.write(out);
} finally {
  fs.rmSync(listFile, { force: true });
}

// Point each matched animal at its photos: add or replace its "images" line.
for (const [key, paths] of imagePaths) {
  const start = text.indexOf(`"item_key": "${key}"`);
  const end = text.indexOf('"item_key"', start + 1);
  const block = text.slice(start, end < 0 ? undefined : end);
  const line = `"images": [${paths.map((p) => JSON.stringify(p)).join(', ')}]`;
  let updated;
  if (/"images":\s*\[[^\]]*\]/.test(block)) updated = block.replace(/"images":\s*\[[^\]]*\]/, line);
  else updated = block.replace(/("image":\s*"[^"]*",)(\r?\n)(\s*)/, `$1$2$3${line},$2$3`);
  if (updated === block) throw new Error(`Could not add photos to "${key}" in the manifest`);
  text = text.slice(0, start) + updated + (end < 0 ? '' : text.slice(end));
}
JSON.parse(text); // never write a broken manifest
fs.writeFileSync(manifestPath, text);

for (const [key, paths] of imagePaths) console.log(`[photos] ${key}: ${paths.length}`);
for (const [key, count] of skipped) console.log(`[photos] skipped ${count} "${key}" (no such animal in "${packId}")`);
