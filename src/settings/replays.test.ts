import { describe, expect, it } from 'vitest';
import { afterReplay, NO_REPLAY_LIMIT, replaysLeftFrom } from './replays';

describe('replays per day', () => {
  const morning = new Date(2026, 8, 30, 8, 0);
  const evening = new Date(2026, 8, 30, 19, 0);
  const tomorrow = new Date(2026, 9, 1, 8, 0);

  it('counts down through the day and starts again the next day', () => {
    let stored = null;
    expect(replaysLeftFrom(stored, 3, morning)).toBe(3);
    stored = afterReplay(stored, morning);
    stored = afterReplay(stored, evening);
    expect(replaysLeftFrom(stored, 3, evening)).toBe(1);
    stored = afterReplay(stored, evening);
    expect(replaysLeftFrom(stored, 3, evening)).toBe(0);
    expect(replaysLeftFrom(stored, 3, tomorrow)).toBe(3);
    expect(afterReplay(stored, tomorrow)).toEqual({ day: '2026-10-1', count: 1 });
  });

  it('supports parent-only (0) and no limit', () => {
    expect(replaysLeftFrom(null, 0, morning)).toBe(0);
    expect(replaysLeftFrom({ day: '2026-9-30', count: 500 }, NO_REPLAY_LIMIT, morning)).toBe(Number.POSITIVE_INFINITY);
  });
});
