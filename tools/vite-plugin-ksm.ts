import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

interface Options {
  allowPlaceholders: boolean;
  telemetryUrl: string;
  /** Optional cloud backup of parents' own packs (Supabase). */
  supabaseUrl: string;
}

/** Shape of /assets/packs/index.json. Browsers can't list folders, so this replaces the folder scan. */
export interface AssetIndex {
  /** Pack ids that have a packs/<id>/manifest.json. */
  packs: string[];
  /** Every real content file under /assets, e.g. "packs/animals/cat_sound.mp3". */
  files: string[];
  /** Every placeholder file under /placeholders (development and test builds only). */
  placeholders: string[];
}

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!/^(desktop\.ini|\.DS_Store|Thumbs\.db)$/i.test(entry.name)) {
        out.push(path.relative(dir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return out.sort();
}

export function buildAssetIndex(assetsDir: string, placeholderDir: string | null): AssetIndex {
  const files = listFiles(assetsDir).filter((f) => f !== 'packs/index.json');
  const packs = files.filter((f) => /^packs\/[^/]+\/manifest\.json$/.test(f)).map((f) => f.split('/')[1]);
  return { packs, files, placeholders: placeholderDir ? listFiles(placeholderDir) : [] };
}

function originOf(url: string, name: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`${name} is not a valid URL: ${url}`);
  }
}

/**
 * Blocks every request to another server. The only exceptions are the telemetry endpoint and the
 * cloud-backup project, and only in builds configured with them.
 */
export function contentSecurityPolicy(telemetryUrl: string, supabaseUrl = ''): string {
  const allowed = [
    ...(telemetryUrl ? [originOf(telemetryUrl, 'VITE_TELEMETRY_URL')] : []),
    ...(supabaseUrl ? [originOf(supabaseUrl, 'VITE_SUPABASE_URL')] : []),
  ];
  const extraOrigins = allowed.map((o) => ` ${o}`).join('');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${extraOrigins}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function copyDir(from: string, to: string): void {
  for (const rel of listFiles(from)) {
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, rel), dest);
  }
}

function serviceWorker(precache: string[], version: string): string {
  return `// Generated at build time. Caches the whole app so it works offline (spec rule 10).
const CACHE = 'ksm-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (request.mode === 'navigate') return caches.match('./index.html').then((page) => page || fetch(request));
      return fetch(request);
    }),
  );
});
`;
}

/** Only clip files the studio makes: a pack's name or sound, or a game line. */
const STUDIO_PATH = /^(packs\/[a-z0-9-]+\/[a-z0-9_-]+|feedback\/[a-z0-9_-]+)\.wav$/;
const OTHER_AUDIO = ['.mp3', '.m4a', '.ogg', '.opus', '.webm', '.wav'];
const MAX_CLIP_BYTES = 5 * 1024 * 1024;

/**
 * The recording studio's save (development server only). Writes one WAV into public/assets. Only
 * accepted from this computer, never from other devices on the Wi-Fi. A file it replaces (an older
 * recording, or the same clip in another format) is moved to dev-assets/replaced, never deleted.
 */
function studioSave(req: IncomingMessage, res: ServerResponse, assetsDir: string, backupDir: string): void {
  const fail = (status: number, message: string) => {
    res.statusCode = status;
    res.end(message);
  };
  const from = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from)) return fail(403, 'The studio only saves from this computer');
  if (req.method !== 'POST') return fail(405, 'POST only');
  const rel = new URL(req.url ?? '', 'http://localhost').searchParams.get('path') ?? '';
  if (!STUDIO_PATH.test(rel)) return fail(400, 'Not a studio clip path');

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_CLIP_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (size > MAX_CLIP_BYTES) return fail(413, 'Clip too long');
    const body = Buffer.concat(chunks);
    if (body.subarray(0, 4).toString('ascii') !== 'RIFF' || body.subarray(8, 12).toString('ascii') !== 'WAVE') {
      return fail(400, 'Not a WAV file');
    }
    const base = rel.replace(/\.wav$/, '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const ext of OTHER_AUDIO) {
      const old = path.join(assetsDir, base + ext);
      if (!fs.existsSync(old)) continue;
      const kept = path.join(backupDir, `${base}${ext}.${stamp}`);
      fs.mkdirSync(path.dirname(kept), { recursive: true });
      fs.renameSync(old, kept);
    }
    const file = path.join(assetsDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ saved: rel }));
  });
}

export function ksmPlugin(opts: Options): Plugin {
  const root = process.cwd();
  const assetsDir = path.join(root, 'public', 'assets');
  const placeholderDir = path.join(root, 'dev-assets', 'placeholders');
  let config: ResolvedConfig;

  return {
    name: 'ksm-assets',

    configResolved(resolved) {
      config = resolved;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        if (url === '/__studio/save') {
          studioSave(req, res, assetsDir, path.join(root, 'dev-assets', 'replaced'));
          return;
        }
        // Studio recordings are written while the server runs, and left out of the file watcher so
        // saving one doesn't reload the page; serve them here.
        if (req.method === 'GET' && url.startsWith('/assets/') && url.endsWith('.wav')) {
          const file = path.resolve(assetsDir, url.slice('/assets/'.length));
          if (file.startsWith(assetsDir + path.sep) && fs.existsSync(file)) {
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'no-store');
            fs.createReadStream(file).pipe(res);
            return;
          }
        }
        if (url === '/assets/packs/index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(buildAssetIndex(assetsDir, opts.allowPlaceholders ? placeholderDir : null)));
          return;
        }
        if (url.startsWith('/placeholders/') && opts.allowPlaceholders) {
          const file = path.resolve(placeholderDir, url.slice('/placeholders/'.length));
          if (!file.startsWith(placeholderDir + path.sep) || !fs.existsSync(file)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },

    transformIndexHtml(html) {
      if (config.command !== 'build') return html;
      const csp = contentSecurityPolicy(opts.telemetryUrl, opts.supabaseUrl);
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },

    closeBundle() {
      if (config.command !== 'build') return;
      const outDir = path.resolve(config.root, config.build.outDir);
      const index = buildAssetIndex(assetsDir, opts.allowPlaceholders ? placeholderDir : null);
      fs.mkdirSync(path.join(outDir, 'assets', 'packs'), { recursive: true });
      fs.writeFileSync(path.join(outDir, 'assets', 'packs', 'index.json'), JSON.stringify(index));
      if (opts.allowPlaceholders) copyDir(placeholderDir, path.join(outDir, 'placeholders'));
      fs.writeFileSync(
        path.join(outDir, 'build-info.json'),
        JSON.stringify({ mode: config.mode, placeholdersAllowed: opts.allowPlaceholders }, null, 2),
      );

      // Host config files (_headers, _redirects) aren't served, so they can't be cached.
      const precache = listFiles(outDir).filter(
        (f) => f !== 'sw.js' && f !== 'build-info.json' && !f.split('/').pop()!.startsWith('_'),
      );
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const urls = ['./', ...precache.map((f) => `./${f}`)];
      fs.writeFileSync(path.join(outDir, 'sw.js'), serviceWorker(urls, hash.digest('hex').slice(0, 12)));
    },
  };
}
