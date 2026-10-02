import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import { sceneQuestionOrder } from '../../content/scenes';
import type { ArGender, Lang, LoadedItem, LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { PlayIcon } from './icons';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, useBoxSize } from './layout';
import { Burst } from './OptionGrid';
import { IdleScene, SessionEndScene } from './scenes';
import { AlbumIcon, awardSticker, StickerAlbum, stickerPicture, StickerReveal } from './Stickers';

const MIN_CELEBRATION_MS = 1200;
const MAX_CELEBRATION_MS = 6000;
const SESSION_END_MS = 3500;
/** A body part can't be marked found the moment it appears (an excited double tap). */
const INPUT_GUARD_MS = 600;

type Stage = 'paused' | 'playing' | 'ending' | 'idle';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The body parts that can be asked about in these languages, for this child. */
export function pointItems(pack: LoadedPack | undefined, languages: readonly Lang[], gender: ArGender): LoadedItem[] {
  return (pack?.items ?? []).filter((i) =>
    languages.every((lang) => (lang === 'en' ? i.point?.en : i.point?.[gender === 'm' ? 'ar_m' : 'ar_f'])),
  );
}

/**
 * Where's your nose? Played together, away from the screen: the app shows a nose and asks
 * "أين أنفُكِ؟"; the child points at her own nose and the parent taps the big tick (or skips).
 * Tapping the picture asks again. Each tick counts towards "Words I know".
 */
export function KidPoint({
  pack,
  packs,
  config,
  snapshot,
  onExit,
}: {
  pack: LoadedPack;
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const gender: ArGender = config.arGender ?? 'f';
  const items = useMemo(() => {
    const allowed = new Set(config.itemKeys);
    return pointItems(pack, spokenLanguages(config.language), gender).filter((i) => allowed.has(i.key));
  }, [pack, config, gender]);
  const pictures = useMemo(() => choosePictures(items), [items]);
  const deal = () =>
    sceneQuestionOrder(
      items.map((i) => i.key),
      Math.min(config.questionsPerSession, Math.max(items.length, 1) * 2),
      Math.random,
    );

  const [order, setOrder] = useState(deal);
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState(false);
  const [stage, setStageState] = useState<Stage>(snapshot ? (snapshot.stage === 'idle' ? 'idle' : 'paused') : 'playing');
  const [newSticker, setNewSticker] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay, config.profileId) > 0);

  const stageRef = useRef(stage);
  const orderRef = useRef(order);
  const indexRef = useRef(0);
  const busy = useRef(false);
  const readyAt = useRef(0);
  const foundKeys = useRef<string[]>([]);
  const gateRef = useRef(false);
  const alive = useRef(true);
  const startedAt = useRef(Date.now());

  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  };

  const audio = useMemo(
    () =>
      new GameAudio(audioEngine, new ClipResolver(pack, spokenLanguages(config.language)), {
        mode: config.mode,
        repeatIntervalSec: config.repeatIntervalSec,
        random: Math.random,
      }),
    [pack, config],
  );

  const item = (i = indexRef.current) => items.find((it) => it.key === orderRef.current[i]);
  const canPlay = () => alive.current && stageRef.current === 'playing' && !gateRef.current && document.visibilityState === 'visible';
  const persist = (s: 'playing' | 'idle') => saveKidSnapshot({ v: 1, config, startedAt: startedAt.current, stage: s, session: null });
  const ask = () => {
    const it = item();
    if (it && canPlay()) void audio.pointAsk(it, gender);
  };

  const present = () => {
    busy.current = false;
    setFound(false);
    readyAt.current = performance.now() + INPUT_GUARD_MS;
    ask();
    const it = item();
    const next = item(indexRef.current + 1);
    audio.preload([...(it ? [it] : []), ...(next ? [next] : [])]);
  };

  const save = async () => {
    if (!foundKeys.current.length) return;
    try {
      await reportStore.saveSession(
        {
          packId: pack.id,
          startedAt: startedAt.current,
          endedAt: Date.now(),
          questionCount: foundKeys.current.length,
          toddlerMode: false,
          choiceCount: 1,
          language: config.language,
          mode: config.mode,
          completed: true,
          profileId: config.profileId,
          game: 'point',
        },
        foundKeys.current.map((key) => ({ itemKey: key, packId: pack.id, firstTryCorrect: true, attempts: 1, choiceCount: 1 })),
      );
    } catch (e) {
      console.warn('[report] could not save the game', e);
    }
  };

  const finish = () => {
    void save();
    const sticker = awardSticker(
      config.profileId,
      foundKeys.current.map((key) => ({ key, packId: pack.id })),
    );
    const stickerItem = sticker ? items.find((i) => i.key === sticker.key) : undefined;
    setNewSticker(stickerItem ? stickerPicture(stickerItem) : null);
    foundKeys.current = [];
    persist('idle');
    setStage('ending');
    const began = performance.now();
    void Promise.race([audio.sessionEnd(), sleep(MAX_CELEBRATION_MS)]).then(() => {
      window.setTimeout(
        () => {
          if (!alive.current) return;
          setCanReplay(replaysLeft(config.replaysPerDay, config.profileId) > 0);
          setStage('idle');
        },
        Math.max(0, SESSION_END_MS - (performance.now() - began)),
      );
    });
  };

  const next = () => {
    if (!alive.current) return;
    if (indexRef.current + 1 >= orderRef.current.length) {
      finish();
      return;
    }
    indexRef.current++;
    setIndex(indexRef.current);
    present();
  };

  /** The parent's tick: she found it on herself. */
  const onFound = () => {
    if (stageRef.current !== 'playing' || gateRef.current || busy.current || performance.now() < readyAt.current) return;
    const it = item();
    if (!it) return;
    busy.current = true;
    setFound(true);
    foundKeys.current.push(it.key);
    const began = performance.now();
    void Promise.race([audio.correct(it), sleep(MAX_CELEBRATION_MS)]).then(async () => {
      const elapsed = performance.now() - began;
      if (elapsed < MIN_CELEBRATION_MS) await sleep(MIN_CELEBRATION_MS - elapsed);
      next();
    });
  };

  const onSkip = () => {
    if (stageRef.current !== 'playing' || gateRef.current || busy.current) return;
    audio.stop();
    next();
  };

  const start = (fresh: boolean) => {
    if (fresh) {
      const o = deal();
      orderRef.current = o;
      setOrder(o);
    }
    indexRef.current = 0;
    setIndex(0);
    foundKeys.current = [];
    startedAt.current = Date.now();
    setStage('playing');
    persist('playing');
    audio.preload([], true);
    present();
  };

  const playAgain = () => {
    if (stageRef.current !== 'idle' || gateRef.current || replaysLeft(config.replaysPerDay, config.profileId) <= 0) return;
    countReplay(config.profileId);
    audioEngine.unlock();
    start(true);
  };

  const exit = () => {
    if (stageRef.current === 'playing') void save();
    audio.stop();
    clearKidSnapshot();
    onExit();
  };

  useEffect(() => {
    alive.current = true;
    if (stageRef.current === 'playing') start(false);
    const onVisibility = () => {
      if (!canPlay()) audio.stop();
      else if (!busy.current) ask();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      audio.stop();
    };
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const size = Math.floor(Math.min(box.w * 0.8, box.h * 0.8, 520));
  const key = order[index];

  return (
    <KidFrame
      stage={stage === 'playing' ? 'point' : stage}
      onGateOpen={() => {
        gateRef.current = true;
        audio.stop();
      }}
      onGateCancel={() => {
        gateRef.current = false;
        if (!busy.current) ask();
      }}
      onExit={exit}
    >
      {stage === 'playing' && (
        <>
          <div className="point-area" ref={ref}>
            {size > 0 && key && (
              <button
                type="button"
                key={index}
                className={found ? 'option point-card celebrate' : 'option point-card'}
                style={{ width: size, height: size }}
                tabIndex={-1}
                aria-hidden="true"
                onPointerDown={() => {
                  if (!busy.current) ask();
                }}
              >
                <img src={pictures[key]} alt="" draggable={false} />
                {found && <Burst size={size} />}
              </button>
            )}
          </div>
          <div className="point-actions">
            <button type="button" className="point-skip" aria-label={t('pointSkip')} onClick={onSkip}>
              <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 5.5l8 6.5-8 6.5zM14 5.5l7 6.5-7 6.5z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" className="point-found" aria-label={t('pointFound')} onClick={onFound}>
              <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </>
      )}
      {stage === 'paused' && <PausedScreen label={t('resumeGame')} onResume={() => start(false)} />}
      {stage === 'ending' && <SessionEndScene />}
      {stage === 'ending' && newSticker && <StickerReveal picture={newSticker} />}
      {stage === 'idle' && <IdleScene />}
      {stage === 'idle' && (
        <div className="kid-center play-again-layer">
          {canReplay && (
            <button type="button" className="resume play-again" aria-label={t('playAgain')} onClick={playAgain}>
              <PlayIcon />
            </button>
          )}
          <button type="button" className="album-btn" aria-label={t('stickerAlbum')} onClick={() => setAlbumOpen(true)}>
            <AlbumIcon />
          </button>
        </div>
      )}
      {stage === 'idle' && albumOpen && (
        <StickerAlbum profileId={config.profileId} packs={packs} audio={audio} onClose={() => setAlbumOpen(false)} />
      )}
    </KidFrame>
  );
}
