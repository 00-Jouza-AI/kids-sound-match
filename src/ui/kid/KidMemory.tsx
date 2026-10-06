import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver } from '../../audio/clips';
import { GameAudio } from '../../audio/gameAudio';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { closeMiss, flip, isFaceUp, newMemoryGame, seededRng, type MemoryState } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import { reportStore } from '../../report/db';
import { countReplay, replaysLeft } from '../../settings/replays';
import { spokenLanguages } from '../../settings/settings';
import { CardNames } from './CardNames';
import { KidFrame, PausedScreen } from './KidFrame';
import { clearKidSnapshot, saveKidSnapshot, type KidConfig, type KidSnapshot } from './kidSnapshot';
import { choosePictures, fitSquares, useBoxSize, type Orientation } from './layout';
import { Burst } from './OptionGrid';
import { IdleScene, SessionEndScene } from './scenes';
import { EndScreen, type PickerOptions } from './EndScreen';
import { awardSticker, StickerAlbum, stickerPicture, StickerReveal } from './Stickers';

/** Two different cards stay face up this long before turning back. */
const MISS_SHOW_MS = 1300;
const SESSION_END_MS = 1800;

type Stage = 'paused' | 'playing' | 'ending' | 'idle';

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** Cards in rows: 2 across when upright (3 for 12 cards), more across when sideways. */
export function memoryRows(count: number, orientation: Orientation): number[][] {
  const perRow = orientation === 'portrait' ? (count > 8 ? 3 : 2) : count > 8 ? 4 : count / 2;
  const rows: number[][] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Array.from({ length: Math.min(perRow, count - i) }, (_, j) => i + j));
  return rows;
}

/**
 * The memory game: pairs face down; turning one says its sound and name, a found pair stays open
 * with a little confetti. No score, no timer, nothing negative: two different cards just turn back.
 */
export function KidMemory({
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
  const items = useMemo(() => new Map(pack.items.map((i) => [i.key, i])), [pack]);
  const keys = useMemo(() => config.itemKeys.filter((k) => items.has(k)), [config, items]);
  const pairs = config.memoryPairs ?? 3;
  const deal = () => newMemoryGame(keys, pairs, seededRng(randomSeed()));

  const [state, setStateValue] = useState<MemoryState>(deal);
  const [stage, setStageValue] = useState<Stage>(snapshot ? 'paused' : 'playing');
  const [lastMatch, setLastMatch] = useState<string | null>(null);
  const [newSticker, setNewSticker] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [canReplay, setCanReplay] = useState(() => replaysLeft(config.replaysPerDay, config.profileId) > 0);
  const stateRef = useRef(state);
  const stageRef = useRef(stage);
  const gateRef = useRef(false);
  const alive = useRef(true);
  const startedAt = useRef(Date.now());

  const setState = (s: MemoryState) => {
    stateRef.current = s;
    setStateValue(s);
  };
  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageValue(s);
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

  // The same kind of picture on every card (drawings, or photos when every card has one).
  const pictures = useMemo(
    () => choosePictures([...new Set(state.cards.map((c) => c.key))].map((k) => items.get(k)!)),
    [state.cards, items],
  );

  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const rows = memoryRows(state.cards.length, box.w > box.h ? 'landscape' : 'portrait');
  const { size, gap } = fitSquares(box, rows);

  const finish = async (done: MemoryState) => {
    try {
      await reportStore.saveSession(
        {
          packId: pack.id,
          startedAt: startedAt.current,
          endedAt: Date.now(),
          questionCount: done.matched.length,
          toddlerMode: false,
          choiceCount: done.cards.length,
          language: config.language,
          mode: config.mode,
          completed: true,
          profileId: config.profileId,
          game: 'memory',
          variant: String(done.matched.length),
          turns: done.turns,
        },
        [],
      );
    } catch (e) {
      console.warn('[report] could not save the game', e);
    }
    const sticker = awardSticker(
      config.profileId,
      done.matched.map((key) => ({ key, packId: pack.id })),
    );
    setNewSticker(sticker && items.has(sticker.key) ? stickerPicture(items.get(sticker.key)!) : null);
    saveKidSnapshot({ v: 1, config, startedAt: startedAt.current, stage: 'idle', session: null });
    setStage('ending');
    await Promise.race([audio.sessionEnd(), new Promise((r) => window.setTimeout(r, 4000))]);
    window.setTimeout(() => {
      if (!alive.current) return;
      setCanReplay(replaysLeft(config.replaysPerDay, config.profileId) > 0);
      setStage('idle');
    }, SESSION_END_MS);
  };

  const onFlip = (id: number) => {
    if (stageRef.current !== 'playing' || gateRef.current) return;
    const { state: next, event } = flip(stateRef.current, id);
    if (event === 'ignored') return;
    setState(next);
    const card = next.cards.find((c) => c.id === id)!;
    const item: LoadedItem = items.get(card.key)!;
    if (event === 'opened' || event === 'miss') void audio.explore(item);
    if (event === 'miss') {
      window.setTimeout(() => {
        if (alive.current) setState(closeMiss(stateRef.current));
      }, MISS_SHOW_MS);
    }
    if (event === 'match' || event === 'done') {
      setLastMatch(card.key);
      const praise = audio.named(item);
      if (event === 'done') {
        void praise.then(() => {
          if (alive.current) void finish(next);
        });
      }
    }
  };

  const playAgain = () => {
    if (stageRef.current !== 'idle' || gateRef.current || replaysLeft(config.replaysPerDay, config.profileId) <= 0) return;
    countReplay(config.profileId);
    audioEngine.unlock();
    startedAt.current = Date.now();
    setState(deal());
    setLastMatch(null);
    setStage('playing');
    saveKidSnapshot({ v: 1, config, startedAt: startedAt.current, stage: 'playing', session: null });
  };

  useEffect(() => {
    alive.current = true;
    if (stageRef.current === 'playing') saveKidSnapshot({ v: 1, config, startedAt: startedAt.current, stage: 'playing', session: null });
    audio.preload(keys.map((k) => items.get(k)!), true);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') audio.stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      audio.stop();
    };
  }, []);

  const exit = () => {
    audio.stop();
    clearKidSnapshot();
    onExit();
  };

  return (
    <KidFrame
      stage={stage}
      onGateOpen={() => {
        gateRef.current = true;
        audio.stop();
      }}
      onGateCancel={() => {
        gateRef.current = false;
      }}
      onExit={exit}
    >
      {stage === 'playing' && (
        <div className="kid-grid" ref={ref} style={{ gap }}>
          {size > 0 &&
            rows.map((row, r) => (
              <div className="kid-row" key={r} style={{ gap }}>
                {row.map((i) => {
                  const card = state.cards[i];
                  const up = isFaceUp(state, card);
                  const found = state.matched.includes(card.key);
                  return (
                    <button
                      type="button"
                      key={card.id}
                      className={`memory-card${up ? ' up' : ''}${found ? ' found' : ''}`}
                      style={{ width: size, height: size }}
                      data-key={card.key}
                      tabIndex={-1}
                      aria-hidden="true"
                      onPointerDown={() => onFlip(card.id)}
                    >
                      <span className="card-inner">
                        <span className="face back" />
                        <span className={config.cardNames ? 'face front named' : 'face front'}>
                          <img src={pictures[card.key]} alt="" draggable={false} />
                          {config.cardNames && up && <CardNames name={items.get(card.key)!.name} />}
                          {found && lastMatch === card.key && <Burst size={size} />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      )}
      {stage === 'paused' && (
        <PausedScreen
          label={t('resumeGame')}
          onResume={() => {
            startedAt.current = Date.now();
            setStage('playing');
          }}
        />
      )}
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
