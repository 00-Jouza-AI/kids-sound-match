import { describe, expect, it } from 'vitest';
import { closeMiss, flip, isFaceUp, newMemoryGame } from './memory';
import { oddQuestion, type OddConfig } from './oddOneOut';
import { seededRng } from './random';
import { GameSession } from './session';

describe('odd one out', () => {
  const easy: OddConfig = {
    families: [
      [
        ['cat', 'dog', 'cow', 'duck', 'hen'],
        ['car', 'bus', 'train', 'ship'],
        ['apple', 'banana', 'bread'],
      ],
    ],
  };
  const kindOf = new Map(easy.families[0].flatMap((pool, i) => pool.map((k) => [k, i] as const)));

  it('shows pictures of one kind and exactly one of another, the different one being the answer', () => {
    const rng = seededRng(4);
    for (let i = 0; i < 3000; i++) {
      const q = oddQuestion(easy, 4, rng, null);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const others = q.options.filter((k) => k !== q.targetKey);
      expect(new Set(others.map((k) => kindOf.get(k))).size).toBe(1);
      expect(kindOf.get(q.targetKey)).not.toBe(kindOf.get(others[0]));
    }
  });

  it('always has one clear answer, even when groups overlap (a duck is a farm animal and a bird)', () => {
    const hard: OddConfig = {
      families: [
        [
          ['cow', 'sheep', 'duck', 'hen'], // farm
          ['bird', 'owl', 'duck', 'hen', 'eagle'], // birds
          ['fish', 'whale', 'seal'], // sea
        ],
      ],
    };
    const rng = seededRng(9);
    for (let i = 0; i < 3000; i++) {
      const q = oddQuestion(hard, 3, rng, null);
      const others = q.options.filter((k) => k !== q.targetKey);
      // No group holds the others and the answer together, so "all farm animals" can't be argued.
      expect(hard.families[0].some((p) => others.every((k) => p.includes(k)) && p.includes(q.targetKey))).toBe(false);
      expect(hard.families[0].some((p) => others.every((k) => p.includes(k)))).toBe(true);
    }
  });

  it('runs a whole game, never asking for the same odd one twice in a row', () => {
    const items = [...kindOf.keys()].map((key) => ({ key, confusableWith: [] }));
    const session = new GameSession({ items, choiceCount: 3, questionsPerSession: 15, toddlerMode: false, odd: easy }, 21);
    let previous = '';
    while (!session.isOver) {
      session.ready();
      const q = session.current.question;
      expect(q.options).toHaveLength(3);
      expect(q.targetKey).not.toBe(previous);
      previous = q.targetKey;
      session.tap(q.targetKey);
      session.finishCelebration();
    }
    expect(session.results).toHaveLength(15);
  });
});

describe('memory game', () => {
  it('deals each picture twice, face down', () => {
    const game = newMemoryGame(['cat', 'dog', 'cow', 'duck', 'hen'], 3, seededRng(2));
    expect(game.cards).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const c of game.cards) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2]);
    expect(game.cards.some((c) => isFaceUp(game, c))).toBe(false);
  });

  it('keeps a found pair open, turns a miss back over, and ends when all pairs are found', () => {
    let game = newMemoryGame(['cat', 'dog'], 2, seededRng(5));
    const ids = (key: string) => game.cards.filter((c) => c.key === key).map((c) => c.id);
    const [cat1, cat2] = ids('cat');
    const [dog1, dog2] = ids('dog');

    let r = flip(game, cat1);
    expect(r.event).toBe('opened');
    r = flip(r.state, dog1);
    expect(r.event).toBe('miss');
    expect(flip(r.state, dog2).event).toBe('ignored'); // two cards already showing
    game = closeMiss(r.state);
    expect(game.open).toEqual([]);

    r = flip(game, cat1);
    r = flip(r.state, cat1); // the same card again does nothing
    expect(r.event).toBe('ignored');
    r = flip(r.state, cat2);
    expect(r.event).toBe('match');
    expect(flip(r.state, cat1).event).toBe('ignored'); // a found pair stays put
    r = flip(r.state, dog1);
    r = flip(r.state, dog2);
    expect(r.event).toBe('done');
    expect(r.state.turns).toBe(3);
  });
});
