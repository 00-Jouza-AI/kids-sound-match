import { describe, expect, it } from 'vitest';
import { MemoryReportStore } from './db';
import { firstTryPercent, itemSummary } from './summary';
import type { NewSession } from './types';

const session = (toddlerMode: boolean): NewSession => ({
  packId: 'animals',
  startedAt: 1,
  endedAt: 2,
  questionCount: 0,
  toddlerMode,
  choiceCount: 3,
  language: 'ar',
  mode: 'SOUND_AND_NAME',
  completed: true,
});
const q = (itemKey: string, firstTryCorrect: boolean) => ({ itemKey, firstTryCorrect, attempts: firstTryCorrect ? 1 : 2, choiceCount: 3 });

describe('report summary', () => {
  it('matches what was played: first-try accuracy per animal, hardest first, toddler games excluded', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(session(false), [q('horse', false), q('cat', true), q('horse', false), q('cat', true)]);
    await store.saveSession(session(false), [q('horse', true), q('cat', false), q('dog', true), q('horse', false), q('horse', false)]);
    await store.saveSession(session(true), [q('horse', true), q('horse', true), q('dog', false)]);

    const rows = itemSummary(await store.sessions(), await store.questions());
    expect(rows).toEqual([
      { itemKey: 'horse', tries: 5, firstTry: 1, percent: 20 },
      { itemKey: 'cat', tries: 3, firstTry: 2, percent: 67 },
      { itemKey: 'dog', tries: 1, firstTry: 1, percent: null },
    ]);
  });

  it('orders animals with too few tries hardest first as well', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(session(false), [q('bear', true), q('tiger', false), q('duck', true)]);
    const rows = itemSummary(await store.sessions(), await store.questions());
    expect(rows.map((r) => r.itemKey)).toEqual(['tiger', 'bear', 'duck']);
  });

  it('computes a game\'s overall first-try accuracy', () => {
    const rows = [q('a', true), q('b', false), q('c', true), q('d', true)].map((r, i) => ({ ...r, id: i, sessionId: 1 }));
    expect(firstTryPercent(rows)).toBe(75);
    expect(firstTryPercent([])).toBeNull();
  });

  it('clears everything', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(session(false), [q('cat', true)]);
    await store.clearAll();
    expect(await store.sessions()).toEqual([]);
    expect(await store.questions()).toEqual([]);
  });
});
