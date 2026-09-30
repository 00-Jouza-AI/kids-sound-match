// Release gate (spec 3.5 and phase 9), run after `npm run build`. Fails the build if it would ship:
//   - any development placeholder (emoji pictures, tones) or a build that allows them
//   - tracking/analytics/ads code or third-party hosts
//   - a Content-Security-Policy that allows other servers (beyond the telemetry origin)
//   - runtime or build dependencies outside the allowlist
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const MARKER = 'KSM-PLACEHOLDER';
// @supabase/supabase-js: optional cloud backup of parents' own packs (agreed 30 Sept 2026).
const RUNTIME_ALLOWLIST = new Set(['react', 'react-dom', '@supabase/supabase-js']);
const DEV_ALLOWLIST = new Set([
  'vite',
  '@vitejs/plugin-react',
  'typescript',
  'vitest',
  '@types/react',
  '@types/react-dom',
  '@types/node',
]);
// Domains of ad, analytics, attribution and crash-reporting services. Matched as domains so that
// ordinary words in React (e.g. the "onDoubleClick" event) don't trigger false alarms.
const TRACKERS =
  /google-analytics\.com|googletagmanager\.com|doubleclick\.net|googlesyndication\.com|googleadservices\.com|firebaseio\.com|firebase\.googleapis\.com|firebaselogging|crashlytics\.com|connect\.facebook\.net|graph\.facebook\.com|sentry\.io|appsflyer\.com|adjust\.com|mixpanel\.com|segment\.(io|com)|amplitude\.com|hotjar\.com|clarity\.ms|branch\.io|onesignal\.com|admob/i;

const problems = [];

/** Reads KEY=value lines, as Vite does, so the gate knows the build's configured servers. */
function readEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return {};
  const entries = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) entries.push([m[1], m[2].replace(/^['"]|['"]$/g, '')]);
  }
  return Object.fromEntries(entries);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

if (!fs.existsSync(DIST)) {
  console.error('check-release: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const info = JSON.parse(fs.readFileSync(path.join(DIST, 'build-info.json'), 'utf8'));
if (info.placeholdersAllowed) problems.push(`build mode "${info.mode}" allows placeholders; release with \`npm run build\``);
if (fs.existsSync(path.join(DIST, 'placeholders'))) problems.push('dist/placeholders/ exists');

const index = JSON.parse(fs.readFileSync(path.join(DIST, 'assets', 'packs', 'index.json'), 'utf8'));
if (index.placeholders.length) problems.push(`asset index lists ${index.placeholders.length} placeholder files`);

for (const file of walk(DIST)) {
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  const bytes = fs.readFileSync(file);
  if (bytes.includes(MARKER)) problems.push(`placeholder file in release: ${rel}`);
  if (/\.(js|html|css|json|webmanifest)$/.test(rel)) {
    const match = TRACKERS.exec(bytes.toString('utf8'));
    if (match) problems.push(`tracking/ads reference "${match[0]}" in ${rel}`);
  }
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
if (!csp) problems.push('index.html has no Content-Security-Policy');
else {
  // The only servers a build may talk to: its telemetry endpoint and cloud-backup project, if set.
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env };
  const allowedOrigins = [env.VITE_TELEMETRY_URL, env.VITE_SUPABASE_URL].flatMap((u) => {
    try {
      return u ? [new URL(u).origin] : [];
    } catch {
      return [];
    }
  });
  const hosts = csp.match(/https?:\/\/[^\s;]+/g) ?? [];
  for (const host of hosts) if (!allowedOrigins.includes(host)) problems.push(`CSP allows another server: ${host}`);
}
const externalRefs = html.match(/(src|href)="https?:\/\/[^"]+"/g) ?? [];
for (const ref of externalRefs) problems.push(`index.html loads from another server: ${ref}`);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  if (!RUNTIME_ALLOWLIST.has(dep)) problems.push(`runtime dependency not on the allowlist: ${dep}`);
}
for (const dep of Object.keys(pkg.devDependencies ?? {})) {
  if (!DEV_ALLOWLIST.has(dep)) problems.push(`build dependency not on the allowlist: ${dep}`);
}

if (problems.length) {
  console.error(`\ncheck-release: FAILED (${problems.length})`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}
console.log('check-release: OK (no placeholders, no trackers, CSP locked to this site, dependencies on the allowlist)');
