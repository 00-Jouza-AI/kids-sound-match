import { isMatchGame, resultPack, type QuestionResultEntity, type SessionEntity } from './types';

/**
 * "Words I know": a word counts as understood once the child got it right first time 3 times, on
 * at least 2 different days. A miss (tapping something else first) takes one right away, so with
 * only 2 pictures, lucky guesses don't add up. Once known, a word stays on the list.
 */
export const KNOWN_AFTER = 3;
export const KNOWN_ON_DAYS = 2;

/** "animals" + "cow" -> "animals/cow". A Mixed game answer counts for the pack its picture came from. */
export function wordId(packId: string, itemKey: string): string {
  return `${packId}/${itemKey}`;
}

export interface WordEvidence {
  word: string;
  /** When the game was played. */
  at: number;
  right: boolean;
}

/**
 * The answers that say whether a child understands a word: the matching game (not Toddler mode,
 * where every tap is right), Find it in the picture, and Where's your nose? (the parent's tick).
 * Games about something else (Who eats what? asks what the animal eats) are left out by `isWordPack`.
 * A hint without a wrong tap says nothing either way.
 */
export function wordEvidence(
  sessions: readonly SessionEntity[],
  questions: readonly QuestionResultEntity[],
  isWordPack: (packId: string) => boolean = () => true,
): WordEvidence[] {
  const counted = new Map(
    sessions
      .filter((s) => !s.toddlerMode && (isMatchGame(s) || s.game === 'scene' || s.game === 'point'))
      .map((s) => [s.id, s]),
  );
  const out: WordEvidence[] = [];
  for (const q of questions) {
    const session = counted.get(q.sessionId);
    if (!session) continue;
    const packId = resultPack(q, session);
    if (!isWordPack(packId)) continue;
    const right = q.firstTryCorrect && !q.hinted;
    const miss = !q.firstTryCorrect && q.attempts > 1;
    if (right || miss) out.push({ word: wordId(packId, q.itemKey), at: session.startedAt, right });
  }
  return out.sort((a, b) => a.at - b.at);
}

function dayOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Every word the child understands, with the moment it first counted. */
export function knownWords(evidence: readonly WordEvidence[]): Map<string, number> {
  const rights = new Map<string, number[]>();
  const known = new Map<string, number>();
  for (const e of [...evidence].sort((a, b) => a.at - b.at)) {
    if (known.has(e.word)) continue;
    const stack = rights.get(e.word) ?? [];
    if (e.right) stack.push(e.at);
    else stack.pop();
    rights.set(e.word, stack);
    if (stack.length >= KNOWN_AFTER && new Set(stack.map(dayOf)).size >= KNOWN_ON_DAYS) known.set(e.word, e.at);
  }
  return known;
}

/** How close a word is: its rights so far (after misses), for "almost there" hints. */
export function wordProgress(evidence: readonly WordEvidence[], word: string): number {
  let n = 0;
  for (const e of evidence) if (e.word === word) n = e.right ? n + 1 : Math.max(0, n - 1);
  return Math.min(n, KNOWN_AFTER);
}
