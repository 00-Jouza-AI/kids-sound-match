import type { GameLanguage, GameMode } from '../settings/settings';

/** Spec 8.1 SessionEntity, plus the settings it was played with. No child name, age or photo, ever. */
export interface SessionEntity {
  id: number;
  packId: string;
  startedAt: number;
  endedAt: number;
  questionCount: number;
  toddlerMode: boolean;
  choiceCount: number;
  language: GameLanguage;
  mode: GameMode;
  /** False when a parent left Kid Mode before the last question. */
  completed: boolean;
  /** The child who played (see settings/profiles). Missing in games saved before profiles: the first child. */
  profileId?: string;
  /** Missing: the matching game (any pack, including Who eats what?). */
  game?: GameKind;
  /** Odd one out: 'easy' or 'hard'. Memory: the number of pairs. */
  variant?: string;
  /** Memory: turns taken (two cards each) to find every pair. */
  turns?: number;
}

export type GameKind = 'match' | 'memory' | 'odd';

/** The matching game feeds the per-picture Report and practice; Memory and Odd one out don't. */
export function isMatchGame(s: Pick<SessionEntity, 'game'>): boolean {
  return !s.game || s.game === 'match';
}

/** Spec 8.1 QuestionResultEntity. */
export interface QuestionResultEntity {
  id: number;
  sessionId: number;
  itemKey: string;
  firstTryCorrect: boolean;
  attempts: number;
  choiceCount: number;
  /** The right picture wiggled before it was found. Missing in games saved before hints existed. */
  hinted?: boolean;
  /** Mixed game: the pack the picture came from. Otherwise the session's pack. */
  packId?: string;
  /** "Who eats what?": the animal the question was about (the item is its food). */
  promptKey?: string;
}

export type NewSession = Omit<SessionEntity, 'id'>;
export type NewQuestionResult = Omit<QuestionResultEntity, 'id' | 'sessionId'>;

/** The pack a result counts for: its own pack in a Mixed game, else the game's pack. */
export function resultPack(q: Pick<QuestionResultEntity, 'packId'>, session: Pick<SessionEntity, 'packId'>): string {
  return q.packId ?? session.packId;
}
