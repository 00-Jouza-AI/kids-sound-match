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
}

export type NewSession = Omit<SessionEntity, 'id'>;
export type NewQuestionResult = Omit<QuestionResultEntity, 'id' | 'sessionId'>;
