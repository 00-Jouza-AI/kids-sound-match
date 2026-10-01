import { firstTryPercent } from './summary';
import type { QuestionResultEntity, SessionEntity } from './types';

export type OddLevel = 'easy' | 'hard';

/** Odd one out moves up after 3 finished easy games at 80%+, and back down after 2 hard games under 50%. */
const ODD_UP_GAMES = 3;
const ODD_UP_PERCENT = 80;
const ODD_DOWN_GAMES = 2;
const ODD_DOWN_PERCENT = 50;

/** The level this child's next Odd one out game is played at (one child's games only). */
export function oddLevel(sessions: readonly SessionEntity[], questions: readonly QuestionResultEntity[]): OddLevel {
  const games = sessions
    .filter((s) => s.game === 'odd' && s.completed && !s.toddlerMode)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (!games.length) return 'easy';
  const level: OddLevel = games[0].variant === 'hard' ? 'hard' : 'easy';
  const need = level === 'easy' ? ODD_UP_GAMES : ODD_DOWN_GAMES;
  const recent = games.filter((g) => (g.variant === 'hard' ? 'hard' : 'easy') === level).slice(0, need);
  if (recent.length < need) return level;
  const ids = new Set(recent.map((g) => g.id));
  const percent = firstTryPercent(questions.filter((q) => ids.has(q.sessionId))) ?? 0;
  if (level === 'easy') return percent >= ODD_UP_PERCENT ? 'hard' : 'easy';
  return percent < ODD_DOWN_PERCENT ? 'easy' : 'hard';
}

/** Memory: 3 finished games in a row with every pair found in at most two turns per pair. */
const MEMORY_GOOD_GAMES = 3;
const MEMORY_TURNS_PER_PAIR = 2;

export interface MemoryNext {
  from: number;
  to: number;
  gamesAtLevel: number;
}

/** "Ready for more memory cards?": 3 pairs → 4 → 6. */
export function memoryReady(sessions: readonly SessionEntity[], pairs: number): MemoryNext | null {
  const to = pairs === 3 ? 4 : pairs === 4 ? 6 : null;
  if (!to) return null;
  const games = sessions
    .filter((s) => s.game === 'memory' && s.completed && Number(s.variant) === pairs)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (games.length < MEMORY_GOOD_GAMES) return null;
  const good = games.slice(0, MEMORY_GOOD_GAMES).every((g) => (g.turns ?? Infinity) <= pairs * MEMORY_TURNS_PER_PAIR);
  return good ? { from: pairs, to, gamesAtLevel: games.length } : null;
}
