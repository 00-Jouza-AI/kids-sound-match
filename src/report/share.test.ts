import { describe, expect, it } from 'vitest';
import { MemoryReportStore } from './db';
import { shareSummary } from './share';
import type { NewSession } from './types';

const game = (over: Partial<NewSession> = {}): NewSession => ({
  packId: 'animals',
  startedAt: 100,
  endedAt: 200,
  questionCount: 0,
  toddlerMode: false,
  choiceCount: 3,
  language: 'ar',
  mode: 'SOUND_AND_NAME',
  completed: true,
  ...over,
});
const q = (itemKey: string, firstTryCorrect: boolean, packId?: string) => ({
  itemKey,
  firstTryCorrect,
  attempts: firstTryCorrect ? 1 : 2,
  choiceCount: 3,
  ...(packId ? { packId } : {}),
});

describe('shared Report picture', () => {
  it('sums up one child: games, answers, packs, what they know and what they are learning', async () => {
    const store = new MemoryReportStore();
    await store.saveSession(game({ startedAt: 50 }), [q('cat', true), q('cat', true), q('cat', true), q('owl', false), q('owl', false), q('owl', true)]);
    await store.saveSession(game({ packId: 'mixed' }), [q('bus', true, 'vehicles')]);
    await store.saveSession(game({ toddlerMode: true }), [q('dog', false), q('dog', false)]);
    const s = shareSummary(await store.sessions(), await store.questions());
    expect(s.games).toBe(3);
    expect(s.answers).toBe(7); // toddler games don't count as answers
    expect(s.firstTryPercent).toBe(71);
    expect(s.since).toBe(50);
    expect(s.packs.map((p) => [p.packId, p.percent])).toEqual([['animals', 67], ['vehicles', 100]]);
    expect(s.strong.map((r) => r.itemKey)).toEqual(['cat']);
    expect(s.learning.map((r) => r.itemKey)).toEqual(['owl']);
  });

  it('says nothing yet for a child who has not played', () => {
    const s = shareSummary([], []);
    expect([s.games, s.answers, s.firstTryPercent, s.since, s.strong.length]).toEqual([0, 0, null, null, 0]);
  });

  it('deletes one child\'s games and their answers only', async () => {
    const store = new MemoryReportStore();
    const keep = await store.saveSession(game(), [q('cat', true)]);
    const gone = await store.saveSession(game({ profileId: 'b' }), [q('dog', true), q('cow', false)]);
    await store.deleteSessions([gone]);
    expect((await store.sessions()).map((s) => s.id)).toEqual([keep]);
    expect((await store.questions()).map((x) => x.itemKey)).toEqual(['cat']);
  });
});
