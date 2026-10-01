import { describe, expect, it } from 'vitest';
import { pickSticker } from '../settings/stickers';
import { MemoryReportStore } from './db';
import { memoryReady, oddLevel } from './levels';
import type { NewSession } from './types';

const game = (over: Partial<NewSession> = {}): NewSession => ({
  packId: 'odd-one-out',
  startedAt: 1,
  endedAt: 2,
  questionCount: 5,
  toddlerMode: false,
  choiceCount: 3,
  language: 'ar',
  mode: 'SOUND_AND_NAME',
  completed: true,
  game: 'odd',
  variant: 'easy',
  ...over,
});
const answers = (right: number, wrong: number) => [
  ...Array.from({ length: right }, () => ({ itemKey: 'car', firstTryCorrect: true, attempts: 1, choiceCount: 3 })),
  ...Array.from({ length: wrong }, () => ({ itemKey: 'cow', firstTryCorrect: false, attempts: 2, choiceCount: 3 })),
];

describe('odd one out levels', () => {
  it('starts easy, moves up after 3 good easy games, and back down after 2 hard ones go badly', async () => {
    const store = new MemoryReportStore();
    const level = async () => oddLevel(await store.sessions(), await store.questions());
    expect(await level()).toBe('easy');
    await store.saveSession(game({ startedAt: 1 }), answers(5, 0));
    await store.saveSession(game({ startedAt: 2 }), answers(4, 1));
    expect(await level()).toBe('easy'); // only 2 games so far
    await store.saveSession(game({ startedAt: 3 }), answers(4, 1));
    expect(await level()).toBe('hard'); // 13 of 15 = 87%
    await store.saveSession(game({ startedAt: 4, variant: 'hard' }), answers(1, 4));
    expect(await level()).toBe('hard'); // one bad game isn't enough
    await store.saveSession(game({ startedAt: 5, variant: 'hard' }), answers(2, 3));
    expect(await level()).toBe('easy'); // 3 of 10 = 30%
  });
});

describe('memory: ready for more cards', () => {
  const memory = (startedAt: number, turns: number, pairs = 3): NewSession =>
    game({ packId: 'animals', game: 'memory', variant: String(pairs), turns, startedAt });

  it('suggests 4 pairs after 3 quick games with 3 pairs, then 6 after 4', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(memory(1, 6), []);
    await store.saveSession(memory(2, 5), []);
    expect(memoryReady(await store.sessions(), 3)).toBeNull();
    await store.saveSession(memory(3, 4), []);
    expect(memoryReady(await store.sessions(), 3)).toMatchObject({ from: 3, to: 4 });
    await store.saveSession(memory(4, 12), []); // a slow game: wait for 3 quick ones again
    expect(memoryReady(await store.sessions(), 3)).toBeNull();
    expect(memoryReady(await store.sessions(), 6)).toBeNull(); // 6 is the most
  });
});

describe('stickers', () => {
  it("gives a picture from this game that the child doesn't have yet", () => {
    const owned = [{ key: 'cat', packId: 'animals', at: 1 }];
    const found = [
      { key: 'cat', packId: 'animals' },
      { key: 'dog', packId: 'animals' },
      { key: 'dog', packId: 'animals' },
    ];
    expect(pickSticker(owned, found, () => 0)).toEqual({ key: 'dog', packId: 'animals' });
    expect(pickSticker([...owned, { key: 'dog', packId: 'animals', at: 2 }], found)).toBeNull();
    // The carrot in Food and in Who eats what? are different stickers.
    expect(pickSticker([{ key: 'carrot', packId: 'food', at: 1 }], [{ key: 'carrot', packId: 'who-eats-what' }])).not.toBeNull();
  });
});
