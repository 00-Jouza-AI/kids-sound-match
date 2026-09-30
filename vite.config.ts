import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { ksmPlugin } from './tools/vite-plugin-ksm.ts';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Placeholders (emoji pictures, tones, device speech) exist in development and test builds only.
  // A release build (`npm run build`) never contains them; tools/check-release.mjs enforces that.
  const allowPlaceholders = command === 'serve' || mode === 'test';
  return {
    base: './',
    plugins: [react(), ksmPlugin({
        allowPlaceholders,
        telemetryUrl: env.VITE_TELEMETRY_URL ?? '',
        supabaseUrl: env.VITE_SUPABASE_URL ?? '',
      })],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __ALLOW_PLACEHOLDERS__: JSON.stringify(allowPlaceholders),
    },
    build: {
      // Keep bundled code out of /assets, which holds the content packs.
      assetsDir: 'app',
    },
    server: { host: true, port: 5173, strictPort: true },
    preview: { host: true, port: 4173, strictPort: true },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
