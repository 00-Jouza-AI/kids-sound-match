import { describe, expect, it } from 'vitest';
import manifest from '../../public/assets/packs/animals/manifest.json';
import { ConfusionGraph } from './confusion';
import { generateQuestion, pickTarget, type Question } from './questionGenerator';
import { reduceQuestion, startQuestion, type QuestionState } from './questionMachine';
import { seededRng } from './random';
import { GameSession } from './session';
import { TargetBag } from './targetBag';
import type { ChoiceCount, EngineItem } from './types';

const animals: EngineItem[] = manifest.items.map((i) => ({ key: i.item_key, confusableWith: i.confusable_with }));
const keys = animals.map((a) => a.key);
const graph = new ConfusionGraph(animals);

function confusablePairIn(options: readonly string[]): string | null {
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      if (graph.areConfusable(options[i], options[j])) return `${options[i]} + ${options[j]}`;
    }
  }
  return null;
}

describe('question generation (spec 4.1)', () => {
  it('never puts confusable animals in the same question across 10,000 questions', () => {
    for (const choiceCount of [2, 3, 4] as ChoiceCount[]) {
      const rng = seededRng(choiceCount * 7919);
      let previous: string | null = null;
      let clashes = 0;
      let wrongSize = 0;
      for (let n = 0; n < 10_000; n++) {
        const q = generateQuestion({ items: animals, choiceCount, previousTargetKey: previous, rng });
        if (confusablePairIn(q.options)) clashes++;
        if (q.options.length !== choiceCount || new Set(q.options).size !== choiceCount) wrongSize++;
        if (!q.options.includes(q.targetKey)) wrongSize++;
        previous = q.targetKey;
      }
      expect(clashes).toBe(0);
      expect(wrongSize).toBe(0);
    }
  });

  it('never picks the same target twice in a row', () => {
    const rng = seededRng(99);
    let previous: string | null = null;
    for (let n = 0; n < 10_000; n++) {
      const target = pickTarget(animals, previous, rng);
      expect(target).not.toBe(previous);
      previous = target;
    }
  });

  it('puts the target in every position', () => {
    const rng = seededRng(5);
    const positions = new Set<number>();
    for (let n = 0; n < 200; n++) {
      const q = generateQuestion({ items: animals, choiceCount: 4, previousTargetKey: null, rng });
      positions.add(q.options.indexOf(q.targetKey));
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('falls back to fewer choices when confusable pairs make a full question impossible', () => {
    const tiny: EngineItem[] = [
      { key: 'a', confusableWith: ['b'] },
      { key: 'b', confusableWith: ['a'] },
      { key: 'c', confusableWith: ['d'] },
      { key: 'd', confusableWith: ['c'] },
      { key: 'e', confusableWith: [] },
    ];
    const tinyGraph = new ConfusionGraph(tiny);
    for (let seed = 0; seed < 50; seed++) {
      const q = generateQuestion({ items: tiny, choiceCount: 4, previousTargetKey: null, rng: seededRng(seed), targetKey: 'a' });
      expect(q.options).toHaveLength(3); // a, one of c/d, e
      expect(q.options).not.toContain('b');
      expect(tinyGraph.areConfusable(q.options[0], q.options[1])).toBe(false);
    }
  });

  it('treats a pair listed on one side only as confusable both ways', () => {
    const oneSided = new ConfusionGraph([
      { key: 'x', confusableWith: ['y'] },
      { key: 'y', confusableWith: [] },
    ]);
    expect(oneSided.areConfusable('y', 'x')).toBe(true);
  });
});

describe('target bag', () => {
  it('asks for every animal once before any animal repeats', () => {
    const bag = new TargetBag(keys, seededRng(3));
    let previous: string | null = null;
    for (let round = 0; round < 5; round++) {
      const seen = new Set<string>();
      for (let i = 0; i < keys.length; i++) {
        const k = bag.next(previous);
        seen.add(k);
        previous = k;
      }
      // A round can lose at most one animal at its boundary (the no-repeat rule).
      expect(seen.size).toBeGreaterThanOrEqual(keys.length - 1);
    }
  });

  it('never repeats the previous target, including across rounds', () => {
    const bag = new TargetBag(['a', 'b', 'c'], seededRng(11));
    let previous: string | null = null;
    for (let i = 0; i < 3000; i++) {
      const k = bag.next(previous);
      expect(k).not.toBe(previous);
      previous = k;
    }
  });
});

describe('adaptive practice (weighted bag)', () => {
  it('deals missed animals twice as often and known ones half as often, never twice in a row', () => {
    const weights = { hard: 2, known: 0.5 };
    const bag = new TargetBag(['hard', 'normal', 'known', 'other'], seededRng(8), undefined, weights);
    const counts: Record<string, number> = { hard: 0, normal: 0, known: 0, other: 0 };
    let previous: string | null = null;
    for (let i = 0; i < 9000; i++) {
      const k = bag.next(previous);
      expect(k).not.toBe(previous);
      counts[k]++;
      previous = k;
    }
    expect(counts.hard / counts.normal).toBeGreaterThan(1.7);
    expect(counts.hard / counts.normal).toBeLessThan(2.3);
    expect(counts.known / counts.normal).toBeGreaterThan(0.4);
    expect(counts.known / counts.normal).toBeLessThan(0.6);
  });

  it('still works when every animal but one is rarely dealt', () => {
    const bag = new TargetBag(['a', 'b'], seededRng(2), undefined, { a: 2, b: 0 });
    let previous: string | null = null;
    for (let i = 0; i < 500; i++) {
      const k = bag.next(previous);
      expect(k).not.toBe(previous);
      previous = k;
    }
  });
});

describe('gentle hints', () => {
  const question: Question = { targetKey: 'cat', options: ['dog', 'cat', 'cow'] };
  const ready = (toddler = false) => reduceQuestion(startQuestion(question, toddler), { type: 'ready' }).state;

  it('only hints while the child is choosing', () => {
    expect(reduceQuestion(startQuestion(question, false), { type: 'hint' }).state.hinted).toBe(false);
    expect(reduceQuestion(ready(), { type: 'hint' }).state.hinted).toBe(true);
    expect(reduceQuestion(ready(true), { type: 'hint' }).state.hinted).toBe(false);
  });

  it('does not count a hinted answer as an unaided first try', () => {
    const hinted = reduceQuestion(ready(), { type: 'hint' }).state;
    const r = reduceQuestion(hinted, { type: 'tap', key: 'cat' });
    expect(r.outcome).toBe('correct');
    expect(r.state.firstTryCorrect).toBe(false);
  });

  it('records the hint in the session result, and refuses hints during a celebration', () => {
    const session = new GameSession({ items: animals, choiceCount: 3, questionsPerSession: 5, toddlerMode: false }, 4);
    session.ready();
    expect(session.hint()).toBe(true);
    session.tap(session.current.question.targetKey);
    expect(session.hint()).toBe(false);
    session.finishCelebration();
    expect(session.results[0]).toMatchObject({ hinted: true, firstTryCorrect: false });
  });
});

describe('question state machine (spec 4.2)', () => {
  const question: Question = { targetKey: 'cat', options: ['dog', 'cat', 'cow'] };
  const tap = (s: QuestionState, key: string) => reduceQuestion(s, { type: 'tap', key });
  const ready = (toddler = false) => reduceQuestion(startQuestion(question, toddler), { type: 'ready' }).state;

  it('ignores taps while the question is still presenting (carry-over taps)', () => {
    const r = tap(startQuestion(question, false), 'cat');
    expect(r.outcome).toBe('ignored');
    expect(r.state.phase).toBe('presenting');
  });

  it('fades a wrong option, and faded options ignore taps', () => {
    const wrong = tap(ready(), 'dog');
    expect(wrong.outcome).toBe('wrong');
    expect(wrong.state.faded).toEqual(['dog']);
    const again = tap(wrong.state, 'dog');
    expect(again.outcome).toBe('ignored');
    expect(again.state.attempts).toBe(1);
  });

  it('ignores every tap during the celebration', () => {
    const correct = tap(ready(), 'cat');
    expect(correct.outcome).toBe('correct');
    for (const key of ['cat', 'dog', 'cow', 'cat']) {
      const r = tap(correct.state, key);
      expect(r.outcome).toBe('ignored');
      expect(r.state).toBe(correct.state);
    }
  });

  it('still requires a tap on the last remaining option', () => {
    let s = tap(ready(), 'dog').state;
    s = tap(s, 'cow').state;
    expect(s.phase).toBe('awaitingTap');
    expect(s.faded).toEqual(['dog', 'cow']);
    const last = tap(s, 'cat');
    expect(last.outcome).toBe('correct');
    expect(last.state.attempts).toBe(3);
    expect(last.state.firstTryCorrect).toBe(false);
  });

  it('never fades anything in toddler mode', () => {
    for (const key of question.options) {
      const r = tap(ready(true), key);
      expect(r.outcome).toBe('toddler');
      expect(r.state.faded).toEqual([]);
      expect(r.state.phase).toBe('celebrating');
      expect(r.state.celebratedKey).toBe(key);
    }
  });

  it('counts a first-try success only when no wrong option was tapped', () => {
    expect(tap(ready(), 'cat').state.firstTryCorrect).toBe(true);
    expect(tap(tap(ready(), 'cow').state, 'cat').state.firstTryCorrect).toBe(false);
  });
});

describe('session (spec 4.3)', () => {
  function playPerfectly(session: GameSession): number {
    let asked = 0;
    while (!session.isOver) {
      session.ready();
      expect(session.tap(session.current.question.targetKey)).toBe('correct');
      asked++;
      if (session.finishCelebration() === 'end') break;
    }
    return asked;
  }

  it('ends after exactly N questions', () => {
    for (const n of [5, 10, 15]) {
      const session = new GameSession({ items: animals, choiceCount: 3, questionsPerSession: n, toddlerMode: false }, 42 + n);
      expect(playPerfectly(session)).toBe(n);
      expect(session.results).toHaveLength(n);
      expect(session.finishCelebration()).toBe('ignored');
      expect(session.tap('cat')).toBe('ignored');
    }
  });

  it('never asks for the same animal twice in a row within a session', () => {
    const session = new GameSession({ items: animals, choiceCount: 4, questionsPerSession: 15, toddlerMode: false }, 7);
    playPerfectly(session);
    const targets = session.results.map((r) => r.itemKey);
    for (let i = 1; i < targets.length; i++) expect(targets[i]).not.toBe(targets[i - 1]);
  });

  it('survives 60 seconds of random tapping without skipping or double-advancing', () => {
    const rng = seededRng(2024);
    const n = 10;
    const session = new GameSession({ items: animals, choiceCount: 4, questionsPerSession: n, toddlerMode: false }, 1);
    let advances = 0;
    // ~100 events a second for 60 seconds: taps anywhere (including faded and unknown keys),
    // stray "ready" and "celebration finished" signals.
    for (let step = 0; step < 6000; step++) {
      const roll = rng.next();
      const before = session.current;
      if (roll < 0.8) {
        const pool = rng.next() < 0.9 ? before.question.options : keys;
        session.tap(pool[Math.floor(rng.next() * pool.length)]);
      } else if (roll < 0.9) {
        session.ready();
      } else {
        const r = session.finishCelebration();
        if (r !== 'ignored') {
          advances++;
          // An advance is only possible from a celebration of the actual target.
          expect(before.phase).toBe('celebrating');
          expect(before.celebratedKey).toBe(before.question.targetKey);
        }
      }
      expect(session.results.length).toBeLessThanOrEqual(n);
    }
    expect(session.results).toHaveLength(advances);
    expect(advances).toBe(n);
  });

  it('marks toddler sessions and records every question', () => {
    const session = new GameSession({ items: animals, choiceCount: 2, questionsPerSession: 5, toddlerMode: true }, 3);
    while (!session.isOver) {
      session.ready();
      const wrongKey = session.current.question.options.find((k) => k !== session.current.question.targetKey)!;
      expect(session.tap(wrongKey)).toBe('toddler');
      session.finishCelebration();
    }
    expect(session.result().toddlerMode).toBe(true);
    expect(session.results).toHaveLength(5);
  });

  it('restores from a snapshot and continues exactly where it left off', () => {
    const config = { items: animals, choiceCount: 3 as ChoiceCount, questionsPerSession: 10, toddlerMode: false };
    const original = new GameSession(config, 77);
    for (let i = 0; i < 4; i++) {
      original.ready();
      original.tap(original.current.question.targetKey);
      original.finishCelebration();
    }
    const restored = new GameSession(config, 0, JSON.parse(JSON.stringify(original.snapshot())));
    expect(restored.current.question).toEqual(original.current.question);
    expect(restored.results).toEqual(original.results);
    for (let i = 0; i < 6; i++) {
      for (const s of [original, restored]) {
        s.ready();
        s.tap(s.current.question.targetKey);
        s.finishCelebration();
      }
      expect(restored.results).toEqual(original.results);
    }
  });
});

describe('association questions ("Who eats what?")', () => {
  // Foods, each with the animals it is asked with. The horse eats apples, carrots and grass.
  const foods: EngineItem[] = [
    { key: 'carrot', confusableWith: [], prompts: ['rabbit', 'donkey', 'horse'] },
    { key: 'apple', confusableWith: [], prompts: ['horse'] },
    { key: 'grass', confusableWith: ['leaves'], prompts: ['cow', 'sheep', 'horse'] },
    { key: 'leaves', confusableWith: ['grass'], prompts: ['giraffe'] },
    { key: 'bone', confusableWith: [], prompts: ['dog'] },
    { key: 'banana', confusableWith: [], prompts: ['monkey'] },
    { key: 'cheese', confusableWith: [], prompts: ['mouse'] },
  ];
  const promptsOf = new Map(foods.map((f) => [f.key, f.prompts!]));

  it('asks about one of the animals that eats the answer, and never offers its other foods', () => {
    const rng = seededRng(11);
    for (let i = 0; i < 5000; i++) {
      const targetKey = foods[i % foods.length].key;
      const q = generateQuestion({ items: foods, choiceCount: 4, previousTargetKey: null, rng, targetKey });
      expect(promptsOf.get(targetKey)).toContain(q.promptKey);
      for (const other of q.options.filter((k) => k !== targetKey)) {
        expect(promptsOf.get(other)).not.toContain(q.promptKey); // e.g. no carrot when asking what the horse eats
      }
      expect(q.options.includes('grass') && q.options.includes('leaves')).toBe(false);
    }
  });

  it('varies the animal, and records it with the result and in the snapshot', () => {
    const config = { items: foods, choiceCount: 3 as ChoiceCount, questionsPerSession: 10, toddlerMode: false };
    const session = new GameSession(config, 5);
    const asked: string[] = [];
    while (!session.isOver) {
      session.ready();
      asked.push(session.current.question.promptKey!);
      session.tap(session.current.question.targetKey);
      session.finishCelebration();
    }
    expect(session.results.map((r) => r.promptKey)).toEqual(asked);
    // The same animal twice in a row only when the answer has no other animal (apple: horse only).
    session.results.forEach((r, i) => {
      if (i > 0 && asked[i] === asked[i - 1]) expect(promptsOf.get(r.itemKey)).toHaveLength(1);
    });

    const midway = new GameSession(config, 9);
    midway.ready();
    midway.tap(midway.current.question.targetKey);
    midway.finishCelebration();
    const restored = new GameSession(config, 0, JSON.parse(JSON.stringify(midway.snapshot())));
    expect(restored.current.question.promptKey).toBe(midway.current.question.promptKey);
  });

  it('takes wrong answers from the same group only (Mixed game: your own packs stay together)', () => {
    const items: EngineItem[] = [
      ...['cat', 'dog', 'cow', 'bus', 'drum'].map((key) => ({ key, confusableWith: [], group: 'builtin' })),
      ...['mama', 'baba', 'teddy'].map((key) => ({ key, confusableWith: [], group: 'custom' })),
    ];
    const group = new Map(items.map((i) => [i.key, i.group]));
    const rng = seededRng(3);
    for (let i = 0; i < 2000; i++) {
      const targetKey = items[i % items.length].key;
      const q = generateQuestion({ items, choiceCount: 4, previousTargetKey: null, rng, targetKey });
      expect(q.options.every((k) => group.get(k) === group.get(targetKey))).toBe(true);
      expect(q.options.length).toBe(group.get(targetKey) === 'custom' ? 3 : 4);
    }
  });
});
