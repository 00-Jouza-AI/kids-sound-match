import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { spokenLanguages } from '../../settings/settings';
import { CardNames } from './CardNames';
import { ArrowIcon } from './icons';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, exploreRows, fitSquares, useBoxSize } from './layout';

const PAGE_SIZE = 6;

/**
 * Explore mode: no questions, nothing to get right. Tap any animal to hear its sound and name.
 * Hearing the sounds before being asked for them suits the youngest (around 12-18 months).
 */
export function KidExplore({
  pack,
  config,
  snapshot,
  onExit,
}: {
  pack: LoadedPack;
  config: KidConfig;
  snapshot: KidSnapshot | null;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const items = useMemo(() => {
    const byKey = new Map(pack.items.map((i) => [i.key, i]));
    return config.itemKeys.map((k) => byKey.get(k)).filter((i): i is LoadedItem => i !== undefined);
  }, [pack, config]);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const [page, setPage] = useState(() => Math.min(snapshot?.page ?? 0, pageCount - 1));
  const [stage, setStageState] = useState<'paused' | 'playing'>(snapshot ? 'paused' : 'playing');
  const [bounce, setBounce] = useState<{ key: string; n: number } | null>(null);
  const stageRef = useRef(stage);
  const gateRef = useRef(false);

  const audio = useMemo(
    () =>
      new GameAudio(audioEngine, new ClipResolver(pack, spokenLanguages(config.language)), {
        mode: config.mode,
        repeatIntervalSec: config.repeatIntervalSec,
        random: Math.random,
      }),
    [pack, config],
  );

  const pageItems = useMemo(() => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [items, page]);
  const pictures = useMemo(() => choosePictures(pageItems), [pageItems]);

  useEffect(() => {
    saveKidSnapshot({ v: 1, config, startedAt: Date.now(), stage: 'playing', session: null, page });
    audio.preload(pageItems);
  }, [page]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') audio.stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      audio.stop();
    };
  }, [audio]);

  const tap = (key: string) => {
    if (stageRef.current !== 'playing' || gateRef.current) return;
    const tapped = items.find((i) => i.key === key);
    if (!tapped) return;
    setBounce((b) => ({ key, n: (b?.n ?? 0) + 1 }));
    void audio.explore(tapped);
  };

  const turn = (delta: number) => {
    audio.stop();
    setBounce(null);
    setPage((p) => (p + delta + pageCount) % pageCount);
  };

  const exit = () => {
    audio.stop();
    clearKidSnapshot();
    onExit();
  };

  return (
    <KidFrame
      stage={stage === 'playing' ? 'explore' : 'paused'}
      onGateOpen={() => {
        gateRef.current = true;
        audio.stop();
      }}
      onGateCancel={() => {
        gateRef.current = false;
      }}
      onExit={exit}
    >
      {stage === 'paused' ? (
        <PausedScreen
          label={t('resumeGame')}
          onResume={() => {
            stageRef.current = 'playing';
            setStageState('playing');
          }}
        />
      ) : (
        <>
          <ExploreGrid key={page} items={pageItems} pictures={pictures} bounce={bounce} names={config.cardNames === true} onTap={tap} />
          {pageCount > 1 && (
            <div className="explore-nav" dir="ltr">
              <button
                type="button"
                className="page-btn"
                aria-label={t('explorePrev')}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  turn(-1);
                }}
              >
                <ArrowIcon direction="left" />
              </button>
              <span className="page-dots" aria-hidden="true">
                {Array.from({ length: pageCount }, (_, i) => (
                  <i key={i} className={i === page ? 'on' : undefined} />
                ))}
              </span>
              <button
                type="button"
                className="page-btn"
                aria-label={t('exploreNext')}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  turn(1);
                }}
              >
                <ArrowIcon direction="right" />
              </button>
            </div>
          )}
        </>
      )}
    </KidFrame>
  );
}

function ExploreGrid({
  items,
  pictures,
  bounce,
  names,
  onTap,
}: {
  items: readonly LoadedItem[];
  pictures: Readonly<Record<string, string>>;
  bounce: { key: string; n: number } | null;
  names: boolean;
  onTap: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const rows = exploreRows(items.length, box.w > box.h ? 'landscape' : 'portrait');
  const { size, gap } = fitSquares(box, rows);
  return (
    <div className="kid-grid" ref={ref} style={{ gap }}>
      {size > 0 &&
        rows.map((row, r) => (
          <div className="kid-row" key={r} style={{ gap }}>
            {row.map((i) => {
              const it = items[i];
              const moving = bounce?.key === it.key ? (bounce.n % 2 ? ' bounce-a' : ' bounce-b') : '';
              return (
                <button
                  type="button"
                  key={it.key}
                  className={`option explore${names ? ' named' : ''}${moving}`}
                  style={{ width: size, height: size }}
                  data-key={it.key}
                  tabIndex={-1}
                  aria-hidden="true"
                  onPointerDown={() => onTap(it.key)}
                >
                  <img src={pictures[it.key]} alt="" draggable={false} />
                  {names && <CardNames name={it.name} />}
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}
