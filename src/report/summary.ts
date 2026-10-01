import { isMatchGame, resultPack, type QuestionResultEntity, type SessionEntity } from './types';

/** Below this many tries a percentage is noise ("حصان — 20%" from one try), so it isn't shown. */
export const MIN_TRIES_FOR_PERCENT = 3;

export interface ItemSummaryRow {
  /** The pack the item belongs to (Mixed-game results count for their own pack). */
  packId: string;
  itemKey: string;
  tries: number;
  firstTry: number;
  /** Null until the item has at least MIN_TRIES_FOR_PERCENT tries. */
  percent: number | null;
}

/**
 * Spec 8.1 summary: per-item first-try accuracy across non-toddler sessions, hardest first.
 * Items are counted per pack: the carrot in Food (its name) and in Who eats what? (who eats it)
 * are different skills.
 */
export function itemSummary(
  sessions: readonly SessionEntity[],
  questions: readonly QuestionResultEntity[],
): ItemSummaryRow[] {
  const counted = new Map(sessions.filter((s) => !s.toddlerMode && isMatchGame(s)).map((s) => [s.id, s]));
  const totals = new Map<string, ItemSummaryRow>();
  for (const q of questions) {
    const session = counted.get(q.sessionId);
    if (!session) continue;
    const packId = resultPack(q, session);
    const id = `${packId}\u0000${q.itemKey}`;
    const t = totals.get(id) ?? { packId, itemKey: q.itemKey, tries: 0, firstTry: 0, percent: null };
    t.tries++;
    if (q.firstTryCorrect) t.firstTry++;
    totals.set(id, t);
  }
  const rows = [...totals.values()].map((t) => ({
    ...t,
    percent: t.tries >= MIN_TRIES_FOR_PERCENT ? Math.round((100 * t.firstTry) / t.tries) : null,
  }));
  // Hardest first. Items with too few tries go last, but are still ordered hardest first.
  const rate = (r: ItemSummaryRow) => r.firstTry / r.tries;
  return rows.sort((a, b) => {
    if ((a.percent === null) !== (b.percent === null)) return a.percent === null ? 1 : -1;
    return rate(a) - rate(b) || b.tries - a.tries || a.itemKey.localeCompare(b.itemKey);
  });
}

export function firstTryPercent(questions: readonly QuestionResultEntity[]): number | null {
  if (!questions.length) return null;
  return Math.round((100 * questions.filter((q) => q.firstTryCorrect).length) / questions.length);
}
