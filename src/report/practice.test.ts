import { describe, expect, it } from 'vitest';
import { MemoryReportStore } from './db';
import { practiceWeights, readyForMore } from './practice';
import type { NewSession } from './types';

const game = (over: Partial<NewSession> = {}): NewSession => ({
  packId: 'animals',
  startedAt: 1,
  endedAt: 2,
  questionCount: 0,
  toddlerMode: false,
  choiceCount: 2,
  language: 'ar',
  mode: 'SOUND_AND_NAME',
  completed: true,
  ...over,
});
const q = (itemKey: string, firstTryCorrect: boolean) => ({ itemKey, firstTryCorrect, attempts: 1, choiceCount: 2, hinted: false });

describe('adaptive practice weights', () => {
  it('asks more for missed animals, less for known ones, and ignores toddler games', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(game(), [q('horse', false), q('cat', true), q('horse', false), q('cat', true)]);
    await store.saveSession(game(), [q('cat', true), q('cat', true), q('dog', true), q('horse', true)]);
    await store.saveSession(game({ toddlerMode: true }), [q('dog', false), q('dog', false), q('dog', false)]);
    await store.saveSession(game({ packId: 'other' }), [q('owl', false), q('owl', false)]);
    const weights = practiceWeights(await store.sessions(), await store.questions(), 'animals');
    expect(weights).toEqual({ horse: 2, cat: 0.5 }); // horse 1/3, cat 4/4, dog too few tries
  });

  it('uses only recent tries, so improvement counts', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(game(), Array.from({ length: 10 }, () => q('owl', false)));
    await store.saveSession(game(), Array.from({ length: 10 }, () => q('owl', true)));
    expect(practiceWeights(await store.sessions(), await store.questions(), 'animals')).toEqual({ owl: 0.5 });
  });
});

describe('ready for more pictures', () => {
  it('suggests the next level after 3 good finished games', async () => {
    const store = new MemoryReportStore();
    for (let i = 0; i < 3; i++) {
      await store.saveSession(game({ startedAt: i }), [q('a', true), q('b', true), q('c', true), q('d', true), q('e', false)]);
    }
    expect(readyForMore(await store.sessions(), await store.questions(), 2)).toEqual({ from: 2, to: 3, percent: 80, gamesAtLevel: 3 });
    expect(readyForMore(await store.sessions(), await store.questions(), 3)).toBeNull();
  });

  it('stays quiet when games are hard, unfinished, too few, or already at 4 pictures', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(game({ startedAt: 1 }), [q('a', true), q('b', false)]);
    await store.saveSession(game({ startedAt: 2 }), [q('a', true), q('b', true)]);
    await store.saveSession(game({ startedAt: 3, completed: false }), [q('a', true)]);
    expect(readyForMore(await store.sessions(), await store.questions(), 2)).toBeNull();
    await store.saveSession(game({ startedAt: 4 }), [q('a', true), q('b', false)]);
    expect(readyForMore(await store.sessions(), await store.questions(), 2)).toBeNull(); // 67%
    expect(readyForMore(await store.sessions(), await store.questions(), 4)).toBeNull();
  });
});
