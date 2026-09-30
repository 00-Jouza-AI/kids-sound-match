import { useCallback, useEffect, useMemo, useState } from 'react';
import { MIXED_PACK_ID, MIXED_PACK_NAME } from '../../content/mixed';
import type { LoadedPack } from '../../content/types';
import { isCustomPackId } from '../../custom/types';
import { formatDateTime, useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { firstTryPercent, itemSummary, type ItemSummaryRow } from '../../report/summary';
import { resultPack, type QuestionResultEntity, type SessionEntity } from '../../report/types';
import { Overlay, Screen, Segmented } from './components';

/**
 * Spec 8.1: per-item summary (names only, never pictures) grouped by pack, game list with details,
 * clear all.
 */
export function ReportScreen({ packs, onBack }: { packs: readonly LoadedPack[]; onBack: () => void }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ sessions: SessionEntity[]; questions: QuestionResultEntity[] } | null>(null);
  const [tab, setTab] = useState<'items' | 'games'>('items');
  const [detail, setDetail] = useState<SessionEntity | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const [sessions, questions] = await Promise.all([reportStore.sessions(), reportStore.questions()]);
    setData({ sessions, questions });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Names per pack; the animals of "Who eats what?" are found through any pack.
  const names = useMemo(() => {
    const byPack = new Map<string, Map<string, string>>();
    const any = new Map<string, string>();
    for (const p of packs) {
      const own = new Map<string, string>();
      for (const i of p.items) {
        own.set(i.key, i.name[lang]);
        any.set(i.key, i.name[lang]);
        for (const about of i.prompts ?? []) any.set(about.key, about.name[lang]);
      }
      byPack.set(p.id, own);
    }
    return { byPack, any };
  }, [packs, lang]);
  // Items from a pack the parent has since deleted have no name any more.
  const name = (packId: string, key: string) =>
    names.byPack.get(packId)?.get(key) ?? names.any.get(key) ?? (/^[0-9a-f-]{36}$/.test(key) ? t('deletedItem') : key);
  const packName = (id: string) =>
    packs.find((p) => p.id === id)?.name[lang] ??
    (id === MIXED_PACK_ID ? MIXED_PACK_NAME[lang] : isCustomPackId(id) ? t('deletedPack') : id);

  const summary = data ? itemSummary(data.sessions, data.questions) : [];
  // One section per pack, in the order the packs are listed in Settings.
  const sections = useMemo(() => {
    const order = new Map(packs.map((p, i) => [p.id, i]));
    const groups = new Map<string, ItemSummaryRow[]>();
    for (const row of summary) groups.set(row.packId, [...(groups.get(row.packId) ?? []), row]);
    return [...groups].sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  }, [summary, packs]);
  const games = data ? [...data.sessions].sort((a, b) => b.startedAt - a.startedAt) : [];
  const questionsOf = (id: number) => data?.questions.filter((q) => q.sessionId === id) ?? [];
  const empty = data !== null && data.sessions.length === 0;
  const arrow = lang === 'ar' ? '←' : '→';

  return (
    <Screen title={t('report')} onBack={onBack}>
      <Segmented
        label={t('report')}
        value={tab}
        options={[
          { value: 'items', label: t('reportByItem') },
          { value: 'games', label: t('reportGames') },
        ]}
        onChange={setTab}
      />

      {empty && <p className="empty">{t('reportEmpty')}</p>}

      {tab === 'items' && !empty && data && (
        <section className="card">
          <p className="hint">{t('reportExplain')}</p>
          {sections.length === 0 ? (
            <p className="empty">{t('reportEmpty')}</p>
          ) : (
            sections.map(([packId, rows]) => (
              <div key={packId} className="report-pack">
                {sections.length > 1 && <h3>{packName(packId)}</h3>}
                <ul className="report-list">
                  {rows.map((row) => (
                    <li key={row.itemKey} className="report-row">
                      <div className="report-line">
                        <span className="report-name">{name(packId, row.itemKey)}</span>
                        <span className="report-value">{row.percent === null ? '—' : `${row.percent}%`}</span>
                      </div>
                      <div className="bar" aria-hidden="true">
                        <i style={{ width: `${row.percent ?? 0}%` }} />
                      </div>
                      <span className="hint">
                        {t('nOfM', { n: row.firstTry, m: row.tries })}
                        {row.percent === null ? ` · ${t('notEnoughTries')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {tab === 'games' && !empty && (
        <section className="card">
          <ul className="report-list">
            {games.map((g) => {
              const pct = firstTryPercent(questionsOf(g.id));
              return (
                <li key={g.id}>
                  <button type="button" className="game-row" onClick={() => setDetail(g)}>
                    <span className="report-name">{formatDateTime(g.startedAt, lang)}</span>
                    <span className="hint">
                      {packName(g.packId)}
                      {' · '}
                      {t('gameQuestions', { n: g.questionCount })}
                      {' · '}
                      {g.toddlerMode ? t('toddlerMode') : pct === null ? '—' : t('gameFirstTry', { p: pct })}
                      {g.completed ? '' : ` · ${t('unfinishedGame')}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!empty && data && (
        <button type="button" className="btn danger-outline wide" onClick={() => setConfirmClear(true)}>
          {t('clearHistory')}
        </button>
      )}

      {detail && (
        <Overlay label={t('gameDetails')} onDismiss={() => setDetail(null)}>
          <h2>{t('gameDetails')}</h2>
          <p className="hint">
            {packName(detail.packId)} · {formatDateTime(detail.startedAt, lang)}
          </p>
          <ol className="detail-list">
            {questionsOf(detail.id).map((q) => {
              const item = name(resultPack(q, detail), q.itemKey);
              return (
                <li key={q.id}>
                  <span>{q.promptKey ? `${names.any.get(q.promptKey) ?? q.promptKey} ${arrow} ${item}` : item}</span>
                  <span className={q.firstTryCorrect ? 'first-try yes' : 'first-try'}>
                    {q.firstTryCorrect ? `✓ ${t('firstTry')}` : q.attempts === 1 ? t('oneTap') : t('taps', { n: q.attempts })}
                    {q.hinted ? ` · ${t('withHint')}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="pin-footer">
            <button type="button" className="btn primary" onClick={() => setDetail(null)}>
              {t('close')}
            </button>
          </div>
        </Overlay>
      )}

      {confirmClear && (
        <Overlay label={t('clearHistoryTitle')} onDismiss={() => setConfirmClear(false)}>
          <h2>{t('clearHistoryTitle')}</h2>
          <p>{t('clearHistoryBody')}</p>
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await reportStore.clearAll();
                setConfirmClear(false);
                await load();
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}
    </Screen>
  );
}
