import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

interface Options {
  allowPlaceholders: boolean;
  telemetryUrl: string;
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

/** Blocks every request to another server. The only exception is the telemetry origin, when configured. */
export function contentSecurityPolicy(telemetryUrl: string): string {
  let telemetryOrigin = '';
  if (telemetryUrl) {
    try {
      telemetryOrigin = ` ${new URL(telemetryUrl).origin}`;
    } catch {
      throw new Error(`VITE_TELEMETRY_URL is not a valid URL: ${telemetryUrl}`);
    }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${telemetryOrigin}`,
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
      const csp = contentSecurityPolicy(opts.telemetryUrl);
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
