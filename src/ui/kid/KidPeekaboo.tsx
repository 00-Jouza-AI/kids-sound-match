import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver, type PeekabooLines } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import { sceneQuestionOrder } from '../../content/scenes';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { CardNames } from './CardNames';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, useBoxSize } from './layout';
import { Burst } from './OptionGrid';
import { IdleScene, SessionEndScene } from './scenes';
import { EndScreen, type PickerOptions } from './EndScreen';
import { awardSticker, StickerAlbum, stickerPicture, StickerReveal } from './Stickers';

/** Taps are ignored this long after the blanket goes back on, so one excited tap can't skip a turn. */
const COVER_GUARD_MS = 700;
/** The picture stays out at least this long before the next tap brings the blanket back. */
const SHOW_AT_LEAST_MS = 1500;
const SESSION_END_MS = 1800;
const MAX_LINE_MS = 4000;

type Stage = 'paused' | 'playing' | 'ending' | 'idle';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Peekaboo, for the youngest (about 12-18 months, before they can choose between pictures): a
 * blanket hides a picture while its sound plays; one tap anywhere pulls the blanket away, "بَخ!",
 * and its name. Another tap brings the blanket back over the next one. Nothing to get wrong.
 */
export function KidPeekaboo({
  pack,
  packs,
  config,
  snapshot,
  lines,
  picker,
  onExit,
}: {
  pack: LoadedPack;
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  /** "بَخ!" / "Peekaboo!", from the shared game lines. */
  lines: PeekabooLines | undefined;
  picker?: PickerOptions;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const items = useMemo(() => {
    const byKey = new Map(pack.items.map((i) => [i.key, i]));
    return config.itemKeys.map((k) => byKey.get(k)).filter((i): i is LoadedItem => i !== undefined);
  }, [pack, config]);
  const pictures = useMemo(() => choosePictures(items), [items]);
  const deal = () =>
    sceneQuestionOrder(
      items.map((i) => i.key),
      config.questionsPerSession,
      Math.random,
    );

  const [order, setOrder] = useState(deal);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [stage, setStageState] = useState<Stage>(snapshot ? (snapshot.stage === 'idle' ? 'idle' : 'paused') : 'playing');
  const [newSticker, setNewSticker] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay, config.profileId) > 0);

  const stageRef = useRef(stage);
  const orderRef = useRef(order);
  const indexRef = useRef(0);
  const openRef = useRef(false);
  const readyAt = useRef(0);
  const seen = useRef<string[]>([]);
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

  /** Under the blanket: its sound, now and then, until the tap. */
  const hide = () => {
    openRef.current = false;
    setOpen(false);
    readyAt.current = performance.now() + COVER_GUARD_MS;
    const it = item();
    if (it && canPlay()) void audio.peekabooHidden(it);
    const next = item(indexRef.current + 1);
    audio.preload([...(it ? [it] : []), ...(next ? [next] : [])]);
  };

  const save = async () => {
    if (!seen.current.length) return;
    try {
      await reportStore.saveSession(
        {
          packId: pack.id,
          startedAt: startedAt.current,
          endedAt: Date.now(),
          questionCount: seen.current.length,
          toddlerMode: false,
          choiceCount: 1,
          language: config.language,
          mode: config.mode,
          completed: true,
          profileId: config.profileId,
          game: 'peekaboo',
        },
        [],
      );
    } catch (e) {
      console.warn('[report] could not save the game', e);
    }
  };

  const finish = () => {
    void save();
    const sticker = awardSticker(
      config.profileId,
      seen.current.map((key) => ({ key, packId: pack.id })),
    );
    const stickerItem = sticker ? items.find((i) => i.key === sticker.key) : undefined;
    setNewSticker(stickerItem ? stickerPicture(stickerItem) : null);
    seen.current = [];
    persist('idle');
    setStage('ending');
    const began = performance.now();
    void Promise.race([audio.sessionEnd(), sleep(MAX_LINE_MS)]).then(() => {
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

  const onTap = () => {
    if (stageRef.current !== 'playing' || gateRef.current || performance.now() < readyAt.current) return;
    const it = item();
    if (!it) return;
    if (!openRef.current) {
      // Peekaboo!
      openRef.current = true;
      setOpen(true);
      seen.current.push(it.key);
      readyAt.current = performance.now() + SHOW_AT_LEAST_MS;
      void audio.peekabooReveal(it, lines);
      return;
    }
    // The blanket goes back on, over the next picture.
    audio.stop();
    if (indexRef.current + 1 >= orderRef.current.length) {
      finish();
      return;
    }
    indexRef.current++;
    setIndex(indexRef.current);
    hide();
  };

  const start = (fresh: boolean) => {
    if (fresh) {
      const next = deal();
      orderRef.current = next;
      setOrder(next);
    }
    indexRef.current = 0;
    setIndex(0);
    seen.current = [];
    startedAt.current = Date.now();
    setStage('playing');
    persist('playing');
    audio.preload([], true);
    hide();
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
      else if (!openRef.current) {
        const it = item();
        if (it) void audio.peekabooHidden(it);
      }
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
  const size = Math.floor(Math.min(box.w * 0.82, box.h * 0.82, 560));
  const key = order[index];

  return (
    <KidFrame
      stage={stage === 'playing' ? 'peekaboo' : stage}
      onGateOpen={() => {
        gateRef.current = true;
        audio.stop();
      }}
      onGateCancel={() => {
        gateRef.current = false;
        if (canPlay() && !openRef.current) {
          const it = item();
          if (it) void audio.peekabooHidden(it);
        }
      }}
      onExit={exit}
    >
      {stage === 'playing' && (
        <div className="peekaboo-area" ref={ref} onPointerDown={onTap}>
          {size > 0 && key && (
            <div
              className={`peekaboo-card${open ? ' open' : ''}${config.cardNames ? ' named' : ''}`}
              key={index}
              style={{ width: size, height: size }}
            >
              <img src={pictures[key]} alt="" draggable={false} />
              {open && config.cardNames && <CardNames name={items.find((i) => i.key === key)!.name} />}
              {open && <Burst size={size * 0.7} />}
              <Blanket />
            </div>
          )}
        </div>
      )}
      {stage === 'paused' && <PausedScreen label={t('resumeGame')} onResume={() => start(false)} />}
      {stage === 'ending' && <SessionEndScene />}
      {stage === 'ending' && newSticker && <StickerReveal picture={newSticker} />}
      {stage === 'idle' && <IdleScene />}
      {stage === 'idle' && <EndScreen canReplay={canReplay} onPlayAgain={playAgain} onAlbum={() => setAlbumOpen(true)} picker={picker} />}
      {stage === 'idle' && albumOpen && (
        <StickerAlbum profileId={config.profileId} packs={packs} audio={audio} onClose={() => setAlbumOpen(false)} />
      )}
    </KidFrame>
  );
}

/** A soft blue blanket with white spots and a wavy hem. */
function Blanket() {
  const dots = [
    [22, 22],
    [52, 16],
    [80, 26],
    [34, 46],
    [66, 44],
    [18, 70],
    [48, 68],
    [82, 66],
  ];
  return (
    <svg className="blanket" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="blanket-cloth" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fd0ff" />
          <stop offset="1" stopColor="#6aa8f0" />
        </linearGradient>
      </defs>
      <path
        d="M4 6 Q50 -2 96 6 L98 88 Q90 98 80 92 Q70 100 60 93 Q50 100 40 93 Q30 100 20 92 Q10 98 2 88 Z"
        fill="url(#blanket-cloth)"
      />
      <path d="M30 8 Q34 50 26 92 M70 8 Q64 50 72 92" stroke="#5b97e0" strokeWidth="2.5" fill="none" opacity="0.45" />
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.2" fill="#fff" opacity="0.85" />
      ))}
      <path
        d="M2 82 Q10 92 20 86 Q30 94 40 87 Q50 94 60 87 Q70 94 80 86 Q90 92 98 82"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}
