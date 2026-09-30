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
