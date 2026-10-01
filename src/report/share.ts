import { firstTryPercent, itemSummary, type ItemSummaryRow } from './summary';
import { resultPack, type QuestionResultEntity, type SessionEntity } from './types';

/** What the shared Report picture says about one child. Toddler games count as games only. */
export interface ShareSummary {
  games: number;
  /** Questions answered outside Toddler mode. */
  answers: number;
  firstTryPercent: number | null;
  /** When the first game was played. */
  since: number | null;
  /** First-try accuracy per pack, most played first. */
  packs: { packId: string; percent: number | null; tries: number }[];
  /** 80% or more on the first try (3+ tries), best first. */
  strong: ItemSummaryRow[];
  /** Under 80% (3+ tries), hardest first. */
  learning: ItemSummaryRow[];
}

const STRONG_FROM = 80;
const MAX_ROWS = 5;

export function shareSummary(sessions: readonly SessionEntity[], questions: readonly QuestionResultEntity[]): ShareSummary {
  const ids = new Set(sessions.map((s) => s.id));
  const own = questions.filter((q) => ids.has(q.sessionId));
  const counted = new Map(sessions.filter((s) => !s.toddlerMode).map((s) => [s.id, s]));
  const answered = own.filter((q) => counted.has(q.sessionId));

  const byPack = new Map<string, QuestionResultEntity[]>();
  for (const q of answered) {
    const packId = resultPack(q, counted.get(q.sessionId)!);
    byPack.set(packId, [...(byPack.get(packId) ?? []), q]);
  }
  const rows = itemSummary(sessions, own).filter((r) => r.percent !== null);
  return {
    games: sessions.length,
    answers: answered.length,
    firstTryPercent: firstTryPercent(answered),
    since: sessions.length ? Math.min(...sessions.map((s) => s.startedAt)) : null,
    packs: [...byPack]
      .map(([packId, qs]) => ({ packId, percent: firstTryPercent(qs), tries: qs.length }))
      .sort((a, b) => b.tries - a.tries),
    strong: rows
      .filter((r) => r.percent! >= STRONG_FROM)
      .sort((a, b) => b.percent! - a.percent! || b.tries - a.tries)
      .slice(0, MAX_ROWS),
    learning: rows.filter((r) => r.percent! < STRONG_FROM).slice(0, MAX_ROWS), // itemSummary is hardest first
  };
}
