import { describe, expect, it } from 'vitest';
import type { QuestionResultEntity, SessionEntity } from './types';
import { knownWords, wordEvidence, wordId } from './words';

const DAY = 24 * 3600 * 1000;
const t0 = new Date(2026, 9, 1, 10, 0).getTime();
let nextQuestion = 1;

function game(id: number, at: number, extra: Partial<SessionEntity> = {}): SessionEntity {
  return {
    id,
    packId: 'animals',
    startedAt: at,
    endedAt: at + 60_000,
    questionCount: 1,
    toddlerMode: false,
    choiceCount: 2,
    language: 'ar',
    mode: 'SOUND_AND_NAME',
    completed: true,
    ...extra,
  };
}

function answer(sessionId: number, itemKey: string, right: boolean, extra: Partial<QuestionResultEntity> = {}): QuestionResultEntity {
  return { id: nextQuestion++, sessionId, itemKey, firstTryCorrect: right, attempts: right ? 1 : 2, choiceCount: 2, ...extra };
}

describe('Words I know', () => {
  it('counts a word after 3 first-time rights on 2 different days', () => {
    const sessions = [game(1, t0), game(2, t0 + 3600_000), game(3, t0 + DAY)];
    const questions = [answer(1, 'cat', true), answer(2, 'cat', true), answer(3, 'cat', true), answer(1, 'cow', true), answer(2, 'cow', true)];
    const known = knownWords(wordEvidence(sessions, questions));
    expect([...known.keys()]).toEqual([wordId('animals', 'cat')]);
    expect(known.get('animals/cat')).toBe(t0 + DAY);
  });

  it('needs two different days: three rights in one morning are not enough', () => {
    const sessions = [game(1, t0), game(2, t0 + 600_000), game(3, t0 + 1_200_000)];
    const questions = [answer(1, 'cat', true), answer(2, 'cat', true), answer(3, 'cat', true)];
    expect(knownWords(wordEvidence(sessions, questions)).size).toBe(0);
  });

  it('lets a miss take one right away, so lucky guesses with 2 pictures don\'t add up', () => {
    const sessions = [game(1, t0), game(2, t0 + DAY), game(3, t0 + 2 * DAY), game(4, t0 + 3 * DAY)];
    const questions = [answer(1, 'dog', true), answer(2, 'dog', false), answer(3, 'dog', true), answer(4, 'dog', true)];
    expect(knownWords(wordEvidence(sessions, questions)).size).toBe(0);
    const more = [...questions, answer(4, 'dog', true)];
    expect(knownWords(wordEvidence(sessions, more)).has('animals/dog')).toBe(true);
  });

  it('keeps a word once it is known', () => {
    const sessions = [game(1, t0), game(2, t0 + DAY), game(3, t0 + 2 * DAY)];
    const questions = [answer(1, 'cat', true), answer(1, 'cat', true), answer(2, 'cat', true), answer(3, 'cat', false), answer(3, 'cat', false)];
    expect(knownWords(wordEvidence(sessions, questions)).has('animals/cat')).toBe(true);
  });

  it('ignores Toddler mode, Memory, Odd one out and Peekaboo, and a hint without a wrong tap', () => {
    const sessions = [
      game(1, t0, { toddlerMode: true }),
      game(2, t0 + DAY, { game: 'memory' }),
      game(3, t0 + DAY, { game: 'odd' }),
      game(4, t0 + DAY, { game: 'peekaboo' }),
      game(5, t0 + 2 * DAY),
    ];
    const questions = [
      answer(1, 'cat', true),
      answer(2, 'cat', true),
      answer(3, 'cat', true),
      answer(4, 'cat', true),
      answer(5, 'cat', false, { attempts: 1, hinted: true }),
    ];
    expect(wordEvidence(sessions, questions)).toEqual([]);
  });

  it('counts Find it in the picture and Where\'s your nose? (the parent\'s tick)', () => {
    const sessions = [game(1, t0, { game: 'scene', packId: 'animals' }), game(2, t0 + DAY, { game: 'point', packId: 'body' })];
    const questions = [answer(1, 'cow', true), answer(2, 'nose', true, { packId: 'body' })];
    expect(wordEvidence(sessions, questions).map((e) => e.word)).toEqual(['animals/cow', 'body/nose']);
  });

  it('counts a Mixed game answer for the pack its picture came from, and skips games about something else', () => {
    const sessions = [game(1, t0, { packId: 'mixed' }), game(2, t0, { packId: 'who-eats-what' })];
    const questions = [answer(1, 'drum', true, { packId: 'instruments' }), answer(2, 'carrot', true)];
    const evidence = wordEvidence(sessions, questions, (packId) => packId !== 'who-eats-what');
    expect(evidence.map((e) => e.word)).toEqual(['instruments/drum']);
  });
});
