import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { isCustomPackId } from '../../custom/types';
import { GameSession, type QuestionState, type SessionResult } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { telemetry } from '../../telemetry/telemetry';
import { PlayIcon, SpeakerIcon } from './icons';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures } from './layout';
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
 * No text, no score, no timer, no negative feedback.
 */
export function KidGame({ pack, config, snapshot, telemetryEnabled, onExit }: Props) {
  const { t } = useI18n();
  const items = useMemo(() => new Map(pack.items.map((i) => [i.key, i])), [pack]);

  // The current game. Replaced by "play again", so everything reads it through the ref.
  const sessionRef = useRef<GameSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createSession(config, items, snapshot);
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
  const [hint, setHint] = useState<{ key: string; pulse: number } | null>(null);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay) > 0);

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

  /** Shows the current question, starts its sound, and accepts taps after the input guard. */
  const presentQuestion = () => {
    const q = game().current;
    clearHint();
    setHint(null);
    setView(q);
    setPictures(choosePictures(q.question.options.map(item)));
    setQuestionNo((n) => n + 1);
    const upcoming = game().upcoming ? game().upcoming!.options.map(item) : [];
    audio.preload([...q.question.options.map(item), ...upcoming]);
    if (canPlay()) void audio.prompt(target());
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
        },
        result.questions.map((q) => ({
          itemKey: q.itemKey,
          firstTryCorrect: q.firstTryCorrect,
          attempts: q.attempts,
          choiceCount: q.choiceCount,
          hinted: q.hinted,
        })),
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
    if (!isCustomPackId(pack.id)) {
      telemetry.record(result, { packId: pack.id, lang: config.language, mode: config.mode }, telemetryEnabled);
    }
    persist('idle');
    setStage('ending');
    const began = performance.now();
    void Promise.race([audio.sessionEnd(), sleep(MAX_CELEBRATION_MS)]).then(() => {
      later(() => {
        setCanReplay(replaysLeft(config.replaysPerDay) > 0);
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
    const sounds = toddler ? audio.toddler(celebrated) : audio.correct(celebrated);
    await Promise.race([sounds, sleep(MAX_CELEBRATION_MS)]);
    const elapsed = performance.now() - began;
    if (elapsed < MIN_CELEBRATION_MS) await sleep(MIN_CELEBRATION_MS - elapsed);
    if (alive.current) advance();
  };

  const onTap = (key: string) => {
    if (stageRef.current !== 'playing' || gateRef.current) return;
    const targetKey = game().current.question.targetKey;
    const outcome = game().tap(key);
    if (outcome === 'ignored') return;
    setView(game().current);
    if (outcome === 'wrong') {
      void audio.wrong(item(targetKey));
      // Two wrong taps: help straight away. Otherwise the 8-second clock starts again.
      if (game().current.faded.length >= 2) showHint();
      else scheduleHint();
      return;
    }
    clearHint();
    void celebrate(item(outcome === 'toddler' ? key : targetKey), outcome === 'toddler');
  };

  const replay = () => {
    if (stageRef.current === 'playing' && !gateRef.current && asking()) void audio.prompt(target());
  };

  const resume = () => {
    setStage('playing');
    audio.preload([], true);
    presentQuestion();
  };

  /** "Play again" from the end screen: a new game with the same settings, counted against today's limit. */
  const playAgain = () => {
    if (stageRef.current !== 'idle' || gateRef.current || replaysLeft(config.replaysPerDay) <= 0) return;
    countReplay();
    audioEngine.unlock();
    sessionRef.current = createSession(config, items, null);
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
      else if (asking()) void audio.prompt(target());
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
        if (canPlay() && asking()) void audio.prompt(target());
      }}
      onExit={exit}
    >
      {stage === 'playing' && pictures[view.question.options[0]] && (
        <OptionGrid
          key={questionNo}
          options={view.question.options}
          pictures={pictures}
          faded={view.faded}
          celebratedKey={view.celebratedKey}
          hint={hint}
          onTap={onTap}
        />
      )}
      {stage === 'paused' && <PausedScreen label={t('resumeGame')} onResume={resume} />}
      {stage === 'ending' && <SessionEndScene />}
      {stage === 'idle' && <IdleScene />}
      {stage === 'idle' && canReplay && (
        <div className="kid-center play-again-layer">
          <button type="button" className="resume play-again" aria-label={t('playAgain')} onClick={playAgain}>
            <PlayIcon />
          </button>
        </div>
      )}
    </KidFrame>
  );
}

function createSession(config: KidConfig, items: Map<string, LoadedItem>, snapshot: KidSnapshot | null): GameSession {
  const engineItems = config.itemKeys
    .filter((k) => items.has(k))
    .map((k) => ({ key: k, confusableWith: items.get(k)!.confusableWith.filter((c) => config.itemKeys.includes(c)) }));
  const sessionConfig = {
    items: engineItems,
    choiceCount: config.choiceCount,
    questionsPerSession: config.questionsPerSession,
    toddlerMode: config.toddlerMode,
    weights: config.weights,
  };
  if (snapshot?.session) {
    try {
      const restored = new GameSession(sessionConfig, 0, snapshot.session);
      if (restored.current.question.options.every((k) => items.has(k))) return restored;
    } catch {
      // Content changed since the snapshot: start a fresh game.
    }
  }
  return new GameSession(sessionConfig, randomSeed());
}
