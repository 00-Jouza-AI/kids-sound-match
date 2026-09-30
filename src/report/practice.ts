import { firstTryPercent } from './summary';
import type { QuestionResultEntity, SessionEntity } from './types';

/** Adaptive practice looks at each animal's most recent tries, so improvement shows up quickly. */
export const RECENT_TRIES = 10;
/** Missed on the first try this often (with at least 2 tries): asked twice per round. */
const STRUGGLING_BELOW = 0.6;
/** Found on the first try this often (with at least 4 tries): asked every other round on average. */
const KNOWN_FROM = 0.9;

/**
 * Weights for the game's shuffle bag (see engine/TargetBag), from the Report stored on this
 * device. Toddler games are ignored. Animals without enough history keep the normal weight.
 */
export function practiceWeights(
  sessions: readonly SessionEntity[],
  questions: readonly QuestionResultEntity[],
  packId: string,
): Record<string, number> {
  const counted = new Set(sessions.filter((s) => !s.toddlerMode && s.packId === packId).map((s) => s.id));
  const history = new Map<string, boolean[]>();
  for (const q of [...questions].sort((a, b) => a.id - b.id)) {
    if (!counted.has(q.sessionId)) continue;
    history.set(q.itemKey, [...(history.get(q.itemKey) ?? []), q.firstTryCorrect]);
  }
  const weights: Record<string, number> = {};
  for (const [key, all] of history) {
    const recent = all.slice(-RECENT_TRIES);
    const rate = recent.filter(Boolean).length / recent.length;
    if (recent.length >= 2 && rate < STRUGGLING_BELOW) weights[key] = 2;
    else if (recent.length >= 4 && rate >= KNOWN_FROM) weights[key] = 0.5;
  }
  return weights;
}

export const NUDGE_GAMES = 3;
export const NUDGE_PERCENT = 80;

export interface NextLevel {
  from: number;
  to: number;
  /** First-try accuracy over the last NUDGE_GAMES finished games at the current level. */
  percent: number;
  /** All finished games at the current level, so a dismissed suggestion can come back later. */
  gamesAtLevel: number;
}

/** "Ready for more?": the last 3 finished games at this many pictures went well. */
export function readyForMore(
  sessions: readonly SessionEntity[],
  questions: readonly QuestionResultEntity[],
  choiceCount: number,
): NextLevel | null {
  if (choiceCount >= 4) return null;
  const games = sessions
    .filter((s) => s.completed && !s.toddlerMode && s.choiceCount === choiceCount)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (games.length < NUDGE_GAMES) return null;
  const recent = new Set(games.slice(0, NUDGE_GAMES).map((g) => g.id));
  const percent = firstTryPercent(questions.filter((q) => recent.has(q.sessionId)));
  if (percent === null || percent < NUDGE_PERCENT) return null;
  return { from: choiceCount, to: choiceCount + 1, percent, gamesAtLevel: games.length };
}
