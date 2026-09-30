import { shuffled, type Rng } from '../engine';
import type { SessionResult } from '../engine';
import type { GameLanguage, GameMode } from '../settings/settings';
import { local } from '../settings/storage';

/**
 * Opt-in anonymous telemetry (spec 8.2). Off by default. With no endpoint configured
 * (VITE_TELEMETRY_URL empty) the feature doesn't exist: the toggle is hidden and nothing is
 * buffered or sent.
 */
export interface TelemetryEvent {
  pack: string;
  item: string;
  choices: number;
  lang: GameLanguage;
  mode: 'sound_name' | 'sound_only' | 'name_only';
  first_try_correct: boolean;
  app_version: string;
}

export interface TelemetryContext {
  packId: string;
  lang: GameLanguage;
  mode: GameMode;
}

interface KeyValueStore {
  getJson<T>(key: string): T | null;
  setJson(key: string, value: unknown): void;
  remove(key: string): void;
}

const BUFFER_KEY = 'ksm.telemetry.buffer.v1';
const DUE_KEY = 'ksm.telemetry.dueAt.v1';
const MIN_DELAY_MS = 2 * 60 * 60 * 1000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** One event per non-toddler question. No user, device, install or session id; no timestamp. */
export function buildEvents(result: SessionResult, ctx: TelemetryContext, appVersion: string): TelemetryEvent[] {
  if (result.toddlerMode) return [];
  return result.questions.map((q) => ({
    pack: ctx.packId,
    item: q.itemKey,
    choices: q.choiceCount,
    lang: ctx.lang,
    mode: ({ SOUND_AND_NAME: 'sound_name', SOUND_ONLY: 'sound_only', NAME_ONLY: 'name_only' } as const)[ctx.mode],
    first_try_correct: q.firstTryCorrect,
    app_version: appVersion,
  }));
}

export function createTelemetry(options: {
  url: string;
  appVersion: string;
  store: KeyValueStore;
  rng: Rng;
  send?: (url: string, body: string) => Promise<boolean>;
}) {
  const { url, appVersion, store, rng } = options;
  const available = url.trim() !== '';
  const send = options.send ?? postJson;

  return {
    available,

    record(result: SessionResult, ctx: TelemetryContext, enabled: boolean, now = Date.now()): void {
      if (!available || !enabled) return;
      const events = buildEvents(result, ctx, appVersion);
      if (!events.length) return;
      store.setJson(BUFFER_KEY, [...(store.getJson<TelemetryEvent[]>(BUFFER_KEY) ?? []), ...events]);
      // Send after a random delay of several hours, so uploads can't be tied to a play time.
      if (store.getJson<number>(DUE_KEY) === null) {
        store.setJson(DUE_KEY, now + MIN_DELAY_MS + Math.floor(rng.next() * (MAX_DELAY_MS - MIN_DELAY_MS)));
      }
    },

    /** Called when the app opens or comes back to the foreground (the web has no background jobs). */
    async flush(enabled: boolean, now = Date.now()): Promise<void> {
      if (!available || !enabled) return;
      const events = store.getJson<TelemetryEvent[]>(BUFFER_KEY) ?? [];
      const due = store.getJson<number>(DUE_KEY);
      if (!events.length || due === null || now < due) return;
      // Shuffle so the order reveals nothing about when or how questions were played.
      if (await send(url, JSON.stringify({ events: shuffled(events, rng) }))) {
        store.remove(BUFFER_KEY);
        store.remove(DUE_KEY);
      }
    },

    /** Turning telemetry off deletes anything not yet sent. */
    discard(): void {
      store.remove(BUFFER_KEY);
      store.remove(DUE_KEY);
    },

    pending(): TelemetryEvent[] {
      return store.getJson<TelemetryEvent[]>(BUFFER_KEY) ?? [];
    },
  };
}

async function postJson(url: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const telemetry = createTelemetry({
  url: import.meta.env.VITE_TELEMETRY_URL ?? '',
  appVersion: __APP_VERSION__,
  store: local,
  rng: { next: () => Math.random() },
});
