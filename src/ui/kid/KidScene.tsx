import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import {
  layoutScene,
  MAX_SCENE_THINGS,
  SCENES,
  sceneCandidates,
  sceneQuestionOrder,
  type SceneDef,
  type SceneThing,
} from '../../content/scenes';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import type { NewQuestionResult } from '../../report/types';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { SpeakerIcon } from './icons';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, useBoxSize } from './layout';
import { Burst } from './OptionGrid';
import { SceneArt, spotPlaces } from './sceneArt';
import { IdleScene, SessionEndScene } from './scenes';
import { EndScreen, type PickerOptions } from './EndScreen';
import { awardSticker, StickerAlbum, stickerPicture, StickerReveal } from './Stickers';

/** Taps are ignored briefly after a question starts, so a finger still tapping can't answer it. */
const INPUT_GUARD_MS = 500;
/** Found it: about a second of confetti and its name, then the next question. */
const CELEBRATION_MS = 1000;
const CELEBRATION_MAX_MS = 1800;
const SESSION_END_MS = 1800;
const SESSION_END_MAX_MS = 4000;
/** Gentle hint: the right thing wiggles after this long without finding it, and again after as long. */
const HINT_AFTER_MS = 8000;

type Stage = 'paused' | 'playing' | 'ending' | 'idle';

interface Answer {
  key: string;
  packId: string;
  taps: number;
  hinted: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The scene to play, from the config (the farm if it's missing or unknown). */
export function sceneOf(config: KidConfig): SceneDef {
  return SCENES.find((s) => s.id === config.sceneId) ?? SCENES[0];
}

/**
 * Find it in the picture: a farm or a doll's house with a few things in it. "Where's the cow?",
 * and the child finds it in the scene. Tapping something else just says what it is (never
 * "wrong"); the right one wiggles if they're stuck. No text, no score.
 */
export function KidScene({
  pack,
  packs,
  config,
  snapshot,
  picker,
  onExit,
}: {
  pack: LoadedPack;
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  picker?: PickerOptions;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const scene = sceneOf(config);
  const candidates = useMemo(() => {
    const allowed = new Set(config.itemKeys);
    return sceneCandidates(scene, packs, (_, item) => allowed.has(item.key));
  }, [scene, packs, config]);
  const count = Math.min(MAX_SCENE_THINGS, config.choiceCount + 2);
  const deal = () => {
    const things = layoutScene(scene, candidates, count, Math.random);
    return {
      things,
      order: sceneQuestionOrder(
        things.map((th) => th.item.key),
        config.questionsPerSession,
        Math.random,
      ),
    };
  };

  const [round, setRound] = useState(deal);
  const [stage, setStageState] = useState<Stage>(snapshot ? (snapshot.stage === 'idle' ? 'idle' : 'paused') : 'playing');
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<string | null>(null);
  const [bounce, setBounce] = useState<{ key: string; n: number } | null>(null);
  const [hint, setHint] = useState<{ key: string; pulse: number } | null>(null);
  const [newSticker, setNewSticker] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay, config.profileId) > 0);

  const stageRef = useRef(stage);
  const roundRef = useRef(round);
  const indexRef = useRef(0);
  const answers = useRef<Answer[]>([]);
  const current = useRef<{ taps: number; hinted: boolean; ready: boolean }>({ taps: 0, hinted: false, ready: false });
  const busy = useRef(false);
  const gateRef = useRef(false);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());
  const hintTimer = useRef<number | null>(null);
  const startedAt = useRef(Date.now());

  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
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

  const things = round.things;
  const pictures = useMemo(() => choosePictures(things.map((th) => th.item)), [things]);
  const thing = (key: string) => roundRef.current.things.find((th) => th.item.key === key);
  const targetKey = () => roundRef.current.order[indexRef.current];
  const target = (): LoadedItem | undefined => thing(targetKey())?.item;
  const canPlay = () => alive.current && stageRef.current === 'playing' && !gateRef.current && document.visibilityState === 'visible';
  const ask = () => {
    const it = target();
    if (it) void audio.prompt(it);
  };

  const persist = (s: 'playing' | 'idle') => saveKidSnapshot({ v: 1, config, startedAt: startedAt.current, stage: s, session: null });

  const clearHint = () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = null;
  };
  const scheduleHint = (ms = HINT_AFTER_MS) => {
    clearHint();
    if (!config.hints) return;
    hintTimer.current = window.setTimeout(() => {
      hintTimer.current = null;
      showHint();
    }, ms);
  };
  const showHint = () => {
    if (!alive.current || stageRef.current !== 'playing') return;
    if (!canPlay() || busy.current) {
      scheduleHint();
      return;
    }
    current.current.hinted = true;
    setHint((h) => ({ key: targetKey(), pulse: (h?.pulse ?? 0) + 1 }));
    scheduleHint();
  };

  const present = () => {
    current.current = { taps: 0, hinted: false, ready: false };
    busy.current = false;
    clearHint();
    setHint(null);
    setFound(null);
    setBounce(null);
    if (canPlay()) ask();
    later(() => {
      current.current.ready = true;
      scheduleHint();
    }, INPUT_GUARD_MS);
  };

  const save = async (completed: boolean) => {
    if (!answers.current.length) return;
    try {
      const questions: NewQuestionResult[] = answers.current.map((a) => ({
        itemKey: a.key,
        packId: a.packId,
        firstTryCorrect: a.taps === 1 && !a.hinted,
        attempts: a.taps,
        choiceCount: roundRef.current.things.length,
        hinted: a.hinted,
      }));
      await reportStore.saveSession(
        {
          packId: pack.id,
          startedAt: startedAt.current,
          endedAt: Date.now(),
          questionCount: questions.length,
          toddlerMode: false,
          choiceCount: roundRef.current.things.length,
          language: config.language,
          mode: config.mode,
          completed,
          profileId: config.profileId,
          game: 'scene',
          variant: scene.id,
        },
        questions,
      );
    } catch (e) {
      console.warn('[report] could not save the game', e);
    }
  };

  const finish = () => {
    clearHint();
    void save(true);
    const sticker = awardSticker(
      config.profileId,
      answers.current.map((a) => ({ key: a.key, packId: a.packId })),
    );
    const stickerItem = sticker ? thing(sticker.key)?.item : undefined;
    setNewSticker(stickerItem ? stickerPicture(stickerItem) : null);
    answers.current = [];
    persist('idle');
    setStage('ending');
    const began = performance.now();
    void Promise.race([audio.sessionEnd(), sleep(SESSION_END_MAX_MS)]).then(() => {
      later(() => {
        setCanReplay(replaysLeft(config.replaysPerDay, config.profileId) > 0);
        setStage('idle');
      }, Math.max(0, SESSION_END_MS - (performance.now() - began)));
    });
  };

  const onTap = (key: string) => {
    if (stageRef.current !== 'playing' || gateRef.current || busy.current || !current.current.ready) return;
    const tapped = thing(key);
    if (!tapped) return;
    current.current.taps++;
    if (key !== targetKey()) {
      // Something else: it hops and says what it is, then the question comes again.
      setBounce((b) => ({ key, n: (b?.n ?? 0) + 1 }));
      const asked = indexRef.current;
      void audio.explore(tapped.item).then(() => {
        if (alive.current && indexRef.current === asked && !busy.current && canPlay()) ask();
      });
      // Two things that weren't it: help straight away. Otherwise the 8-second clock starts again.
      if (current.current.taps >= 2) showHint();
      else scheduleHint();
      return;
    }
    busy.current = true;
    clearHint();
    setHint(null);
    setFound(key);
    answers.current.push({ key, packId: tapped.packId, taps: current.current.taps, hinted: current.current.hinted });
    const began = performance.now();
    const cap = CELEBRATION_MAX_MS * spokenLanguages(config.language).length;
    void Promise.race([audio.named(tapped.item), sleep(cap)]).then(async () => {
      const elapsed = performance.now() - began;
      if (elapsed < CELEBRATION_MS) await sleep(CELEBRATION_MS - elapsed);
      if (!alive.current) return;
      if (indexRef.current + 1 >= roundRef.current.order.length) {
        finish();
        return;
      }
      indexRef.current++;
      setIndex(indexRef.current);
      present();
    });
  };

  const start = (fresh: boolean) => {
    if (fresh) {
      const next = deal();
      roundRef.current = next;
      setRound(next);
    }
    indexRef.current = 0;
    setIndex(0);
    answers.current = [];
    startedAt.current = Date.now();
    setStage('playing');
    persist('playing');
    audio.preload(
      roundRef.current.things.map((th) => th.item),
      true,
    );
    present();
  };

  const playAgain = () => {
    if (stageRef.current !== 'idle' || gateRef.current || replaysLeft(config.replaysPerDay, config.profileId) <= 0) return;
    countReplay(config.profileId);
    audioEngine.unlock();
    start(true);
  };

  const exit = () => {
    if (stageRef.current === 'playing') void save(false);
    clearHint();
    audio.stop();
    clearKidSnapshot();
    onExit();
  };

  useEffect(() => {
    alive.current = true;
    if (stageRef.current === 'playing') start(false);
    const resumeSound = () => {
      if (!canPlay()) audio.stop();
      else if (!busy.current) ask();
    };
    document.addEventListener('visibilitychange', resumeSound);
    const offAudioState = audioEngine.onStateChange(() => {
      if (!audioEngine.running) audio.stop();
      else resumeSound();
    });
    return () => {
      alive.current = false;
      for (const id of timers.current) window.clearTimeout(id);
      timers.current.clear();
      clearHint();
      document.removeEventListener('visibilitychange', resumeSound);
      offAudioState();
      audio.stop();
    };
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const places = box.w > 0 && box.h > 0 ? spotPlaces(scene.id, box.w, box.h) : null;
  const asking = targetKey();

  return (
    <KidFrame
      stage={stage === 'playing' ? 'scene' : stage}
      left={
        stage === 'playing' ? (
          <button
            type="button"
            className="replay"
            aria-label={t('replaySound')}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!busy.current) ask();
            }}
          >
            <SpeakerIcon />
          </button>
        ) : undefined
      }
      onGateOpen={() => {
        gateRef.current = true;
        audio.stop();
      }}
      onGateCancel={() => {
        gateRef.current = false;
        if (canPlay() && !busy.current) ask();
      }}
      onExit={exit}
    >
      {stage === 'playing' && (
        <div className={`scene-box scene-${scene.id}`} ref={ref} data-question={index}>
          {places && (
            <>
              <SceneArt id={scene.id} w={box.w} h={box.h} />
              {things.map((th: SceneThing) => {
                const at = places[th.spot];
                if (!at) return null;
                const key = th.item.key;
                let state = '';
                if (found === key) state = ' celebrate';
                else if (found) state = '';
                else if (hint?.key === key && asking === key) state = hint.pulse % 2 ? ' hint-a' : ' hint-b';
                else if (bounce?.key === key) state = bounce.n % 2 ? ' bounce-a' : ' bounce-b';
                return (
                  <button
                    type="button"
                    key={key}
                    className={`scene-thing${state}`}
                    style={{ left: at.x - at.size / 2, top: at.y - at.size / 2, width: at.size, height: at.size }}
                    data-key={key}
                    tabIndex={-1}
                    aria-hidden="true"
                    onPointerDown={() => onTap(key)}
                  >
                    <img src={pictures[key]} alt="" draggable={false} />
                    {found === key && <Burst size={at.size} />}
                  </button>
                );
              })}
            </>
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
