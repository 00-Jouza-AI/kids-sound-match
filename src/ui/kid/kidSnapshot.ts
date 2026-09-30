import type { ChoiceCount, SessionSnapshot } from '../../engine';
import type { GameLanguage, GameMode } from '../../settings/settings';
import { session as tabStorage } from '../../settings/storage';

export type KidKind = 'game' | 'explore';

/** The settings a game was started with. Changing Settings mid-game doesn't affect it. */
export interface KidConfig {
  kind: KidKind;
  packId: string;
  itemKeys: string[];
  choiceCount: ChoiceCount;
  questionsPerSession: number;
  toddlerMode: boolean;
  mode: GameMode;
  language: GameLanguage;
  repeatIntervalSec: number;
  hints: boolean;
  /** Adaptive practice: how often each animal is dealt, fixed when the game starts. */
  weights: Record<string, number>;
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
  // Snapshots saved before Explore, hints and adaptive practice existed.
  s.config = { ...s.config, kind: s.config.kind ?? 'game', hints: s.config.hints ?? true, weights: s.config.weights ?? {} };
  return s;
}

export function saveKidSnapshot(snapshot: KidSnapshot): void {
  tabStorage.setJson(KEY, snapshot);
}

export function clearKidSnapshot(): void {
  tabStorage.remove(KEY);
}
