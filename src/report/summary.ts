import type { QuestionResultEntity, SessionEntity } from './types';

/** Below this many tries a percentage is noise ("حصان — 20%" from one try), so it isn't shown. */
export const MIN_TRIES_FOR_PERCENT = 3;

export interface ItemSummaryRow {
  itemKey: string;
  tries: number;
  firstTry: number;
  /** Null until the item has at least MIN_TRIES_FOR_PERCENT tries. */
  percent: number | null;
}

/** Spec 8.1 summary: per-item first-try accuracy across non-toddler sessions, hardest first. */
export function itemSummary(
  sessions: readonly SessionEntity[],
  questions: readonly QuestionResultEntity[],
): ItemSummaryRow[] {
  const counted = new Set(sessions.filter((s) => !s.toddlerMode).map((s) => s.id));
  const totals = new Map<string, { tries: number; firstTry: number }>();
  for (const q of questions) {
    if (!counted.has(q.sessionId)) continue;
    const t = totals.get(q.itemKey) ?? { tries: 0, firstTry: 0 };
    t.tries++;
    if (q.firstTryCorrect) t.firstTry++;
    totals.set(q.itemKey, t);
  }
  const rows = [...totals].map(([itemKey, t]) => ({
    itemKey,
    tries: t.tries,
    firstTry: t.firstTry,
    percent: t.tries >= MIN_TRIES_FOR_PERCENT ? Math.round((100 * t.firstTry) / t.tries) : null,
  }));
  // Hardest first. Animals with too few tries go last, but are still ordered hardest first.
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
