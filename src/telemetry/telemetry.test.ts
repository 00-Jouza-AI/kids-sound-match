import { describe, expect, it } from 'vitest';
import { seededRng } from '../engine';
import type { SessionResult } from '../engine';
import { buildEvents, createTelemetry } from './telemetry';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getJson<T>(key: string): T | null {
      const v = data.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    setJson(key: string, value: unknown) {
      data.set(key, JSON.stringify(value));
    },
    remove(key: string) {
      data.delete(key);
    },
  };
}

const result: SessionResult = {
  toddlerMode: false,
  questions: [
    { itemKey: 'cat', firstTryCorrect: false, attempts: 2, choiceCount: 3, hinted: false },
    { itemKey: 'dog', firstTryCorrect: true, attempts: 1, choiceCount: 3, hinted: false },
  ],
};
const ctx = { packId: 'animals', lang: 'ar' as const, mode: 'SOUND_AND_NAME' as const };

describe('telemetry', () => {
  it('builds events with exactly the spec fields and no identifiers', () => {
    const events = buildEvents(result, ctx, '1.0.0');
    expect(events[0]).toEqual({
      pack: 'animals',
      item: 'cat',
      choices: 3,
      lang: 'ar',
      mode: 'sound_name',
      first_try_correct: false,
      app_version: '1.0.0',
    });
    expect(buildEvents({ ...result, toddlerMode: true }, ctx, '1.0.0')).toEqual([]);
  });

  it('does nothing at all when no endpoint is configured', async () => {
    const store = memoryStore();
    let sent = 0;
    const t = createTelemetry({ url: '', appVersion: '1', store, rng: seededRng(1), send: async () => (++sent, true) });
    t.record(result, ctx, true);
    await t.flush(true, Number.MAX_SAFE_INTEGER);
    expect(t.available).toBe(false);
    expect(store.data.size).toBe(0);
    expect(sent).toBe(0);
  });

  it('does nothing while the parent has not opted in', () => {
    const store = memoryStore();
    const t = createTelemetry({ url: 'https://example.test/t', appVersion: '1', store, rng: seededRng(1) });
    t.record(result, ctx, false);
    expect(store.data.size).toBe(0);
  });

  it('waits hours before sending, sends shuffled events once, then clears the buffer', async () => {
    const store = memoryStore();
    const bodies: string[] = [];
    const t = createTelemetry({
      url: 'https://example.test/t',
      appVersion: '1',
      store,
      rng: seededRng(1),
      send: async (_url, body) => (bodies.push(body), true),
    });
    t.record(result, ctx, true, 0);
    await t.flush(true, 60 * 60 * 1000); // 1 hour later: too early
    expect(bodies).toHaveLength(0);
    await t.flush(true, 7 * 60 * 60 * 1000);
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]).events).toHaveLength(2);
    expect(t.pending()).toEqual([]);
  });

  it('deletes the buffer when turned off', () => {
    const store = memoryStore();
    const t = createTelemetry({ url: 'https://example.test/t', appVersion: '1', store, rng: seededRng(1) });
    t.record(result, ctx, true);
    expect(t.pending()).toHaveLength(2);
    t.discard();
    expect(store.data.size).toBe(0);
  });
});
