import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import { mixedGroups, sourcePacks } from '../../content/mixed';
import type { AssociationCelebration, LoadedItem, LoadedPack } from '../../content/types';
import { isCustomPackId } from '../../custom/types';
import { GameSession, type Question, type QuestionState, type SessionResult } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { telemetry } from '../../telemetry/telemetry';
import { PlayIcon, SpeakerIcon } from './icons';
import { AlbumIcon, awardSticker, StickerAlbum, stickerPicture, StickerReveal } from './Stickers';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, useBoxSize } from './layout';
import { OptionGrid } from './OptionGrid';
import { IdleScene, SessionEndScene } from './scenes';

/** Taps are ignored briefly after a question appears, so a finger still tapping can't skip it. */
const INPUT_GUARD_MS = 500;
/** Spec 6.5: ~1.2 s of celebration; longer if the name and praise take longer, so nothing is cut off. */
const MIN_CELEBRATION_MS = 1200;
const MAX_CELEBRATION_MS = 6000;
const SESSION_END_MS = 3500;
/** Gentle hint: the right picture wiggles after this long without a tap, and again after as long. */
const HINT_AFTER_MS = 8000;

type Stage = 'paused' | 'playing' | 'ending' | 'idle';

interface Props {
  pack: LoadedPack;
  /** Every pack, for the sticker album. */
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  telemetryEnabled: boolean;
  onExit: () => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * The game (spec 6): only the pictures, a small replay button and the parent's corner circle.
 * No text, no score, no timer, no negative feedback. In "Who eats what?" the animal sits above
 * the pictures and eats the right one.
 */
export function KidGame({ pack, packs, config, snapshot, telemetryEnabled, onExit }: Props) {
  const { t } = useI18n();
  // Odd one out: "Which one is different?" instead of a sound or a name.
  const odd = config.kind === 'odd';
  const items = useMemo(() => new Map(pack.items.map((i) => [i.key, i])), [pack]);
  // "Who eats what?": the animals the questions are about.
  const promptItems = useMemo(() => new Map(pack.items.flatMap((i) => i.prompts ?? []).map((p) => [p.key, p])), [pack]);
  // Mixed game: which pack each picture came from, and which pictures may share a question.
  const sources = useMemo(() => sourcePacks(pack), [pack]);
  const groups = useMemo(() => mixedGroups(pack), [pack]);

  // The current game. Replaced by "play again", so everything reads it through the ref.
  const sessionRef = useRef<GameSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createSession(pack, config, items, groups, snapshot);
  const game = () => sessionRef.current!;

  const audio = useMemo(
    () =>
      new GameAudio(audioEngine, new ClipResolver(pack, spokenLanguages(config.language)), {
        mode: config.mode,
        repeatIntervalSec: config.repeatIntervalSec,
        random: Math.random,
      }),
    [pack, config],
  );

  const [stage, setStageState] = useState<Stage>(() =>
    snapshot ? (snapshot.stage === 'idle' ? 'idle' : 'paused') : 'playing',
  );
  const [view, setView] = useState<QuestionState>(() => game().current);
  const [questionNo, setQuestionNo] = useState(0);
  const [pictures, setPictures] = useState<Record<string, string>>({});
  const [promptPicture, setPromptPicture] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; pulse: number } | null>(null);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay, config.profileId) > 0);
  const [newSticker, setNewSticker] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);

  // Refs mirror state for async callbacks (timers, audio promises).
  const stageRef = useRef(stage);
  const gateRef = useRef(false);
  const alive = useRef(true);
  const timers = useRef(new Set<number>());
  const hintTimer = useRef<number | null>(null);
  const startedAt = useRef(snapshot?.startedAt ?? Date.now());

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
  const item = (key: string): LoadedItem => items.get(key)!;
  const target = () => item(game().current.question.targetKey);
  /** "Who eats what?": the animal a question is about. Undefined in the other games. */
  const aboutOf = (q: Question) => (q.promptKey !== undefined ? promptItems.get(q.promptKey) : undefined);
  const about = () => aboutOf(game().current.question);
  /** The question, said again until it's answered. */
  const ask = () => audio.prompt(target(), about(), odd);
  const asking = () => ['presenting', 'awaitingTap'].includes(game().current.phase);
  const canPlay = () =>
    alive.current && stageRef.current === 'playing' && !gateRef.current && document.visibilityState === 'visible';

  const persist = (stageToSave: 'playing' | 'idle') =>
    saveKidSnapshot({
      v: 1,
      config,
      startedAt: startedAt.current,
      stage: stageToSave,
      session: stageToSave === 'playing' ? game().snapshot() : null,
    });

  const clearHint = () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    hintTimer.current = null;
  };

  const scheduleHint = (ms = HINT_AFTER_MS) => {
    clearHint();
    if (!config.hints || config.toddlerMode) return;
    hintTimer.current = window.setTimeout(() => {
      hintTimer.current = null;
      showHint();
    }, ms);
  };

  /** The right picture wiggles, and keeps wiggling every few seconds until it's tapped. */
  const showHint = () => {
    if (!alive.current) return;
    if (!canPlay()) {
      scheduleHint(); // behind the parent gate or in the background: try again later
      return;
    }
    if (!game().hint()) return;
    setView(game().current);
    setHint((h) => ({ key: game().current.question.targetKey, pulse: (h?.pulse ?? 0) + 1 }));
    scheduleHint();
  };

  /** Everything on screen for a question: its pictures, plus the animal it's about. */
  const shown = (q: Question): LoadedItem[] => {
    const a = aboutOf(q);
    return [...q.options.map(item), ...(a ? [a] : [])];
  };

  /** Shows the current question, starts its sound, and accepts taps after the input guard. */
  const presentQuestion = () => {
    const q = game().current;
    clearHint();
    setHint(null);
    setView(q);
    // One call for the animal and the pictures, so photos and emoji never share a screen.
    const pics = choosePictures(shown(q.question));
    const a = aboutOf(q.question);
    setPromptPicture(a ? pics[a.key] : null);
    setPictures(pics);
    setQuestionNo((n) => n + 1);
    const upcoming = game().upcoming;
    audio.preload([...shown(q.question), ...(upcoming ? shown(upcoming) : [])]);
    if (canPlay()) void ask();
    later(() => {
      game().ready();
      setView(game().current);
      scheduleHint();
    }, INPUT_GUARD_MS);
  };

  const saveToReport = async (result: SessionResult, completed: boolean) => {
    if (!result.questions.length) return;
    try {
      await reportStore.saveSession(
        {
          packId: pack.id,
          startedAt: startedAt.current,
          endedAt: Date.now(),
          questionCount: result.questions.length,
          toddlerMode: result.toddlerMode,
          choiceCount: config.choiceCount,
          language: config.language,
          mode: config.mode,
          completed,
          profileId: config.profileId,
          ...(odd ? { game: 'odd' as const, variant: config.oddLevel ?? 'easy' } : {}),
        },
        result.questions.map((q) => {
          const source = sources.get(q.itemKey);
          return {
            itemKey: q.itemKey,
            firstTryCorrect: q.firstTryCorrect,
            attempts: q.attempts,
            choiceCount: q.choiceCount,
            hinted: q.hinted,
            ...(source ? { packId: source } : {}),
            ...(q.promptKey !== undefined ? { promptKey: q.promptKey } : {}),
          };
        }),
      );
    } catch (e) {
      console.warn('[report] could not save the game', e);
    }
  };

  const finishSession = () => {
    clearHint();
    const result = game().result();
    void saveToReport(result, true);
    // The parent's own packs are personal: they never go into (even anonymous) statistics.
    // Mixed games can include them, so they're left out too.
    if (!isCustomPackId(pack.id) && !pack.parts) {
      telemetry.record(result, { packId: pack.id, lang: config.language, mode: config.mode }, telemetryEnabled);
    }
    persist('idle');
    // A sticker of something the child just found, if there's one they don't have yet.
    const sticker = awardSticker(
      config.profileId,
      result.questions.map((q) => ({ key: q.itemKey, packId: sources.get(q.itemKey) ?? pack.id })),
    );
    setNewSticker(sticker && items.has(sticker.key) ? stickerPicture(item(sticker.key)) : null);
    setStage('ending');
    const began = performance.now();
    void Promise.race([audio.sessionEnd(), sleep(MAX_CELEBRATION_MS)]).then(() => {
      later(() => {
        setCanReplay(replaysLeft(config.replaysPerDay, config.profileId) > 0);
        setStage('idle');
      }, Math.max(0, SESSION_END_MS - (performance.now() - began)));
    });
  };

  const advance = () => {
    const r = game().finishCelebration();
    if (r === 'next') {
      persist('playing');
      presentQuestion();
    } else if (r === 'end') {
      finishSession();
    }
  };

  const celebrate = async (celebrated: LoadedItem, toddler: boolean) => {
    const began = performance.now();
    const sounds = toddler ? audio.toddler(celebrated) : audio.correct(celebrated, pack.kind === 'association');
    await Promise.race([sounds, sleep(MAX_CELEBRATION_MS)]);
    const elapsed = performance.now() - began;
    if (elapsed < MIN_CELEBRATION_MS) await sleep(MIN_CELEBRATION_MS - elapsed);
    if (alive.current) advance();
  };

  const onTap = (key: string) => {
    if (stageRef.current !== 'playing' || gateRef.current) return;
    const targetKey = game().current.question.targetKey;
    const askedAbout = about();
    const outcome = game().tap(key);
    if (outcome === 'ignored') return;
    setView(game().current);
    if (outcome === 'wrong') {
      void audio.wrong(item(targetKey), askedAbout, odd);
      // Two wrong taps: help straight away. Otherwise the 8-second clock starts again.
      if (game().current.faded.length >= 2) showHint();
      else scheduleHint();
      return;
    }
    clearHint();
    void celebrate(item(outcome === 'toddler' ? key : targetKey), outcome === 'toddler');
  };

  const replay = () => {
    if (stageRef.current === 'playing' && !gateRef.current && asking()) void ask();
  };

  const resume = () => {
    setStage('playing');
    audio.preload([], true);
    presentQuestion();
  };

  /** "Play again" from the end screen: a new game with the same settings, counted against today's limit. */
  const playAgain = () => {
    if (stageRef.current !== 'idle' || gateRef.current || replaysLeft(config.replaysPerDay, config.profileId) <= 0) return;
    countReplay(config.profileId);
    audioEngine.unlock();
    sessionRef.current = createSession(pack, config, items, groups, null);
    startedAt.current = Date.now();
    setStage('playing');
    persist('playing');
    audio.preload([], true);
    presentQuestion();
  };

  const exit = () => {
    if ((stageRef.current === 'playing' || stageRef.current === 'paused') && game().results.length) {
      void saveToReport(game().result(), false);
    }
    clearHint();
    audio.stop();
    clearKidSnapshot();
    onExit();
  };

  useEffect(() => {
    alive.current = true;
    if (stageRef.current === 'playing') {
      audio.preload([], true);
      persist('playing');
      presentQuestion();
    }
    const resumeSound = () => {
      if (!canPlay()) audio.stop();
      else if (asking()) void ask();
    };
    document.addEventListener('visibilitychange', resumeSound);
    // A phone call or another app can suspend audio; stop cleanly and resume the sound afterwards.
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

  const grid = stage === 'playing' && pictures[view.question.options[0]] && (
    <OptionGrid
      key={questionNo}
      options={view.question.options}
      pictures={pictures}
      faded={view.faded}
      celebratedKey={view.celebratedKey}
      hint={hint}
      onTap={onTap}
    />
  );

  return (
    <KidFrame
      stage={stage}
      left={
        stage === 'playing' ? (
          <button
            type="button"
            className="replay"
            aria-label={t('replaySound')}
            onPointerDown={(e) => {
              e.stopPropagation();
              replay();
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
        if (canPlay() && asking()) void ask();
      }}
      onExit={exit}
    >
      {grid && view.question.promptKey !== undefined && promptPicture ? (
        <AskAbout
          questionNo={questionNo}
          picture={promptPicture}
          answer={view.celebratedKey ? pictures[view.celebratedKey] : null}
          celebration={pack.association?.celebration ?? 'eat'}
          onTap={replay}
        >
          {grid}
        </AskAbout>
      ) : (
        grid
      )}
      {stage === 'paused' && <PausedScreen label={t('resumeGame')} onResume={resume} />}
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

/**
 * "Who eats what?" and "Where does it live?": the animal in a round frame above the pictures
 * (beside them when the phone is sideways). Tapping it asks again. After a right answer the food
 * moves into it and it munches, or its home appears around it and it hops.
 */
/** Eaten, at home, or the baby beside its mother. */
const CELEBRATION_CLASS: Record<AssociationCelebration, string> = { eat: 'eating', home: 'at-home', baby: 'with-baby' };

function AskAbout({
  questionNo,
  picture,
  answer,
  celebration,
  onTap,
  children,
}: {
  questionNo: number;
  picture: string;
  /** The right answer's picture, once it's found. */
  answer: string | null;
  celebration: AssociationCelebration;
  onTap: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const landscape = box.w > box.h;
  const size = Math.floor(landscape ? Math.min(box.w * 0.34, box.h * 0.8) : Math.min(box.h * 0.3, box.w * 0.62));
  return (
    <div className={landscape ? 'assoc landscape' : 'assoc'} ref={ref}>
      {size > 0 && (
        <button
          type="button"
          // Its own key space: the pictures next to it are keyed by the question number too.
          key={`about-${questionNo}`}
          className={answer ? `prompt-card ${CELEBRATION_CLASS[celebration]}` : 'prompt-card'}
          style={{ width: size, height: size }}
          tabIndex={-1}
          aria-hidden="true"
          onPointerDown={(e) => {
            e.stopPropagation();
            onTap();
          }}
        >
          {answer && celebration === 'home' && <img className="home-bg" src={answer} alt="" draggable={false} />}
          <img className="about" src={picture} alt="" draggable={false} />
          {answer && celebration === 'eat' && <img className="bite" src={answer} alt="" draggable={false} />}
          {answer && celebration === 'baby' && <img className="baby" src={answer} alt="" draggable={false} />}
        </button>
      )}
      {children}
    </div>
  );
}

function createSession(
  pack: LoadedPack,
  config: KidConfig,
  items: Map<string, LoadedItem>,
  groups: Map<string, string>,
  snapshot: KidSnapshot | null,
): GameSession {
  const engineItems = config.itemKeys
    .filter((k) => items.has(k))
    .map((k) => {
      const it = items.get(k)!;
      const group = groups.get(k);
      return {
        key: k,
        confusableWith: it.confusableWith.filter((c) => config.itemKeys.includes(c)),
        ...(it.prompts ? { prompts: it.prompts.map((p) => p.key) } : {}),
        ...(group ? { group } : {}),
      };
    });
  const odd = config.kind === 'odd' ? pack.odd?.[config.oddLevel ?? 'easy'] : undefined;
  const sessionConfig = {
    items: engineItems,
    choiceCount: config.choiceCount,
    questionsPerSession: config.questionsPerSession,
    toddlerMode: config.toddlerMode,
    weights: config.weights,
    ...(odd ? { odd } : {}),
  };
  if (snapshot?.session) {
    try {
      const restored = new GameSession(sessionConfig, 0, snapshot.session);
      const q = restored.current.question;
      const aboutOk = q.promptKey === undefined || items.get(q.targetKey)?.prompts?.some((p) => p.key === q.promptKey);
      if (q.options.every((k) => items.has(k)) && aboutOk) return restored;
    } catch {
      // Content changed since the snapshot: start a fresh game.
    }
  }
  return new GameSession(sessionConfig, randomSeed());
}
