import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LoadedPack } from '../../content/types';
import { formatDateTime, useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { firstTryPercent, itemSummary } from '../../report/summary';
import type { QuestionResultEntity, SessionEntity } from '../../report/types';
import { Overlay, Screen, Segmented } from './components';

/** Spec 8.1: per-animal summary (names only, never pictures), game list with details, clear all. */
export function ReportScreen({ packs, onBack }: { packs: readonly LoadedPack[]; onBack: () => void }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ sessions: SessionEntity[]; questions: QuestionResultEntity[] } | null>(null);
  const [tab, setTab] = useState<'animals' | 'games'>('animals');
  const [detail, setDetail] = useState<SessionEntity | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const [sessions, questions] = await Promise.all([reportStore.sessions(), reportStore.questions()]);
    setData({ sessions, questions });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of packs) for (const i of p.items) map.set(i.key, i.name[lang]);
    return map;
  }, [packs, lang]);
  const name = (key: string) => names.get(key) ?? key;

  const summary = data ? itemSummary(data.sessions, data.questions) : [];
  const games = data ? [...data.sessions].sort((a, b) => b.startedAt - a.startedAt) : [];
  const questionsOf = (id: number) => data?.questions.filter((q) => q.sessionId === id) ?? [];
  const empty = data !== null && data.sessions.length === 0;

  return (
    <Screen title={t('report')} onBack={onBack}>
      <Segmented
        label={t('report')}
        value={tab}
        options={[
          { value: 'animals', label: t('reportByAnimal') },
          { value: 'games', label: t('reportGames') },
        ]}
        onChange={setTab}
      />

      {empty && <p className="empty">{t('reportEmpty')}</p>}

      {tab === 'animals' && !empty && data && (
        <section className="card">
          <p className="hint">{t('reportExplain')}</p>
          {summary.length === 0 ? (
            <p className="empty">{t('reportEmpty')}</p>
          ) : (
            <ul className="report-list">
              {summary.map((row) => (
                <li key={row.itemKey} className="report-row">
                  <div className="report-line">
                    <span className="report-name">{name(row.itemKey)}</span>
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
          <p className="hint">{formatDateTime(detail.startedAt, lang)}</p>
          <ol className="detail-list">
            {questionsOf(detail.id).map((q) => (
              <li key={q.id}>
                <span>{name(q.itemKey)}</span>
                <span className={q.firstTryCorrect ? 'first-try yes' : 'first-try'}>
                  {q.firstTryCorrect ? `✓ ${t('firstTry')}` : q.attempts === 1 ? t('oneTap') : t('taps', { n: q.attempts })}
                  {q.hinted ? ` · ${t('withHint')}` : ''}
                </span>
              </li>
            ))}
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
