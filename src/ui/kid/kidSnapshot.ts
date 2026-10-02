import type { ArGender } from '../../content/types';
import type { ChoiceCount, SessionSnapshot } from '../../engine';
import { FIRST_PROFILE_ID } from '../../settings/profiles';
import type { GameLanguage, GameMode } from '../../settings/settings';
import { session as tabStorage } from '../../settings/storage';

/** The matching game, Explore, Memory, Odd one out, Peekaboo, Find it in the picture, or Where's your nose? */
export type KidKind = 'game' | 'explore' | 'memory' | 'odd' | 'peekaboo' | 'scene' | 'point';

/** The settings a game was started with. Changing Settings mid-game doesn't affect it. */
export interface KidConfig {
  kind: KidKind;
  /** The child playing (see settings/profiles): their Report and play-again count. */
  profileId: string;
  packId: string;
  itemKeys: string[];
  choiceCount: ChoiceCount;
  questionsPerSession: number;
  toddlerMode: boolean;
  mode: GameMode;
  language: GameLanguage;
  repeatIntervalSec: number;
  hints: boolean;
  /** Games the child can start again from the end screen today (see settings/replays). */
  replaysPerDay: number;
  /** Adaptive practice: how often each animal is dealt, fixed when the game starts. */
  weights: Record<string, number>;
  /** Memory: pairs of cards. */
  memoryPairs?: number;
  /** Odd one out: easy (three animals and a car) or hard (three farm animals and a fish). */
  oddLevel?: 'easy' | 'hard';
  /** Find it in the picture: the farm or the house. */
  sceneId?: string;
  /** Where's your nose?: the child's Arabic grammar (أنفُكِ / أنفُكَ). */
  arGender?: ArGender;
}

/**
 * Saved after every question (or page, in Explore) so a reload, the web's "process death",
 * returns to the same place instead of dropping the child into Parent Mode.
 */
export interface KidSnapshot {
  v: 1;
  config: KidConfig;
  startedAt: number;
  stage: 'playing' | 'idle';
  session: SessionSnapshot | null;
  /** Explore mode: the page of animals on screen. */
  page?: number;
}

const KEY = 'ksm.kid.v1';

export function loadKidSnapshot(): KidSnapshot | null {
  const s = tabStorage.getJson<KidSnapshot>(KEY);
  if (!s || s.v !== 1 || !s.config || !Array.isArray(s.config.itemKeys)) return null;
  // Snapshots saved before Explore, hints, adaptive practice and child profiles existed.
  s.config = {
    ...s.config,
    kind: s.config.kind ?? 'game',
    hints: s.config.hints ?? true,
    weights: s.config.weights ?? {},
    replaysPerDay: s.config.replaysPerDay ?? 0,
    profileId: s.config.profileId ?? FIRST_PROFILE_ID,
  };
  return s;
}

export function saveKidSnapshot(snapshot: KidSnapshot): void {
  tabStorage.setJson(KEY, snapshot);
}

export function clearKidSnapshot(): void {
  tabStorage.remove(KEY);
}
