import { useCallback, useEffect, useMemo, useState } from 'react';
import { MIXED_PACK_ID, MIXED_PACK_NAME } from '../../content/mixed';
import { ODD_PACK_ID, ODD_PACK_NAME } from '../../content/odd';
import type { LoadedPack } from '../../content/types';
import { blobUrl } from '../../custom/toLoaded';
import { isCustomPackId } from '../../custom/types';
import { formatDateTime, useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { renderReportImage, type ReportImageRow } from '../../report/reportImage';
import { shareSummary } from '../../report/share';
import { firstTryPercent, itemSummary, type ItemSummaryRow } from '../../report/summary';
import { resultPack, type QuestionResultEntity, type SessionEntity } from '../../report/types';
import { forProfile, type ProfileState } from '../../settings/profiles';
import { Overlay, Screen, Segmented } from './components';
import { ProfileRow } from './ProfileRow';

/**
 * Spec 8.1: per-item summary (names only, never pictures) grouped by pack, game list with details,
 * clear history. One child at a time; shareable as a picture.
 */
export function ReportScreen({
  packs,
  profiles,
  onBack,
}: {
  packs: readonly LoadedPack[];
  profiles: ProfileState;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<{ sessions: SessionEntity[]; questions: QuestionResultEntity[] } | null>(null);
  const [childId, setChildId] = useState(profiles.activeId);
  const [tab, setTab] = useState<'items' | 'games'>('items');
  const [detail, setDetail] = useState<SessionEntity | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [shared, setShared] = useState<{ blob: Blob; url: string } | null>(null);
  const [shareProblem, setShareProblem] = useState(false);
  const child = profiles.profiles.find((p) => p.id === childId) ?? profiles.profiles[0];
  const several = profiles.profiles.length > 1;

  const load = useCallback(async () => {
    const [sessions, questions] = await Promise.all([reportStore.sessions(), reportStore.questions()]);
    setData({ sessions, questions });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only this child's games.
  const mine = useMemo(() => {
    if (!data) return null;
    const sessions = forProfile(data.sessions, child.id);
    const ids = new Set(sessions.map((s) => s.id));
    return { sessions, questions: data.questions.filter((q) => ids.has(q.sessionId)) };
  }, [data, child.id]);

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
    (id === MIXED_PACK_ID
      ? MIXED_PACK_NAME[lang]
      : id === ODD_PACK_ID
        ? ODD_PACK_NAME[lang]
        : isCustomPackId(id)
          ? t('deletedPack')
          : id);
  /** What a game was: the pack, or Memory / Odd one out with how it went. */
  const gameLine = (g: SessionEntity, pct: number | null) => {
    if (g.game === 'memory') {
      return `${t('memoryGame')} · ${packName(g.packId)} · ${t('memoryRow', { n: g.variant ?? g.questionCount, turns: g.turns ?? 0 })}`;
    }
    const firstTry = g.toddlerMode ? t('toddlerMode') : pct === null ? '—' : t('gameFirstTry', { p: pct });
    const what = g.game === 'odd' ? `${t('oddOneOut')} · ${g.variant === 'hard' ? t('oddHard') : t('oddEasy')}` : packName(g.packId);
    return `${what} · ${t('gameQuestions', { n: g.questionCount })} · ${firstTry}`;
  };

  const summary = mine ? itemSummary(mine.sessions, mine.questions) : [];
  // One section per pack, in the order the packs are listed in Settings.
  const sections = useMemo(() => {
    const order = new Map(packs.map((p, i) => [p.id, i]));
    const groups = new Map<string, ItemSummaryRow[]>();
    for (const row of summary) groups.set(row.packId, [...(groups.get(row.packId) ?? []), row]);
    return [...groups].sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  }, [summary, packs]);
  const games = mine ? [...mine.sessions].sort((a, b) => b.startedAt - a.startedAt) : [];
  const questionsOf = (id: number) => mine?.questions.filter((q) => q.sessionId === id) ?? [];
  const empty = mine !== null && mine.sessions.length === 0;
  const arrow = lang === 'ar' ? '←' : '→';

  /** Draws the picture first, so the share sheet opens straight from the next tap. */
  const prepareShare = async () => {
    if (!mine) return;
    const s = shareSummary(mine.sessions, mine.questions);
    const rows = (list: ItemSummaryRow[]): ReportImageRow[] =>
      list.map((r) => ({ name: name(r.packId, r.itemKey), detail: packName(r.packId), percent: r.percent }));
    const blob = await renderReportImage({
      rtl: lang === 'ar',
      title: t('appName'),
      subtitle: `${t('report')} · ${new Date().toLocaleDateString(lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      avatar: child ? { animal: child.animal, color: child.color } : null,
      stats: [
        { value: String(s.games), label: t('shareGames') },
        { value: String(s.answers), label: t('shareAnswers') },
        { value: s.firstTryPercent === null ? '—' : `${s.firstTryPercent}%`, label: t('shareFirstTry') },
      ],
      sections: [
        {
          title: t('shareByPack'),
          style: 'bars',
          rows: s.packs.slice(0, 6).map((p) => ({ name: packName(p.packId), percent: p.percent })),
          empty: t('shareNothingYet'),
        },
        { title: t('shareStrong'), style: 'good', rows: rows(s.strong), empty: t('shareNothingYet') },
        { title: t('shareLearning'), style: 'learn', rows: rows(s.learning), empty: t('shareNothingYet') },
      ],
      footer: t('shareFooter'),
    });
    setShareProblem(false);
    setShared({ blob, url: blobUrl(blob) });
  };

  const file = () => new File([shared!.blob], 'kids-sound-match-report.png', { type: 'image/png' });
  const canShareFiles = () => {
    try {
      return Boolean(shared && navigator.canShare?.({ files: [file()] }));
    } catch {
      return false;
    }
  };
  const share = async () => {
    try {
      await navigator.share({ files: [file()], title: t('report') });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setShareProblem(true);
    }
  };
  const save = () => {
    const a = document.createElement('a');
    a.href = shared!.url;
    a.download = 'kids-sound-match-report.png';
    a.click();
  };

  return (
    <Screen title={t('report')} onBack={onBack}>
      {several && <ProfileRow profiles={profiles.profiles} activeId={child.id} onSelect={setChildId} label={t('children')} />}
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

      {tab === 'items' && !empty && mine && (
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
                      {gameLine(g, pct)}
                      {g.completed ? '' : ` · ${t('unfinishedGame')}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!empty && mine && (
        <div className="stack">
          <button type="button" className="btn primary wide" onClick={() => void prepareShare()}>
            📤 {t('shareReport')}
          </button>
          <button type="button" className="btn danger-outline wide" onClick={() => setConfirmClear(true)}>
            {several ? t('clearChildHistory') : t('clearHistory')}
          </button>
        </div>
      )}

      {shared && (
        <Overlay label={t('shareReport')} onDismiss={() => setShared(null)}>
          <h2>{t('shareReport')}</h2>
          <img className="share-preview" src={shared.url} alt={t('report')} />
          <p className="hint">{t('shareHint')}</p>
          {shareProblem && (
            <p className="msg error" role="alert">
              {t('shareFailed')}
            </p>
          )}
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setShared(null)}>
              {t('close')}
            </button>
            <button type="button" className="btn" onClick={save}>
              {t('savePicture')}
            </button>
            {canShareFiles() && (
              <button type="button" className="btn primary" onClick={() => void share()}>
                {t('share')}
              </button>
            )}
          </div>
        </Overlay>
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
          <h2>{several ? t('clearChildHistoryTitle') : t('clearHistoryTitle')}</h2>
          <p>{several ? t('clearChildHistoryBody') : t('clearHistoryBody')}</p>
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await reportStore.deleteSessions(mine?.sessions.map((s) => s.id) ?? []);
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
