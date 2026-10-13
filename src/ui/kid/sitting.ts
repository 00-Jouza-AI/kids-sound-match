import { createContext, useContext } from 'react';
import type { Clip } from '../../audio/clips';

/**
 * The play-time timer. A sitting starts with the first game played from Home and lasts through
 * play-agains and the end screen's picker, until the parent leaves to Home. When its minutes are
 * up, the question being played finishes, then a "time to rest" screen stays until the parent
 * unlocks.
 */
export interface Sitting {
  /** When the sitting's time is up (ms since 1970); null when the timer is off. */
  restAt: number | null;
  /** "وقت الراحة" / "Time to rest", in the game's languages. */
  restClips: readonly Clip[];
}

export const SittingContext = createContext<Sitting>({ restAt: null, restClips: [] });

export function useSitting(): Sitting {
  return useContext(SittingContext);
}

/** When the time runs out mid-question, the rest screen waits at most this long for it to end. */
export const REST_GRACE_MS = 30_000;

const QUESTION_DONE = 'ksm:question-done';

/** Games call this between questions: a rest that is due starts here, not in the middle of one. */
export function questionDone(): void {
  window.dispatchEvent(new Event(QUESTION_DONE));
}

export function onQuestionDone(listener: () => void): () => void {
  window.addEventListener(QUESTION_DONE, listener);
  return () => window.removeEventListener(QUESTION_DONE, listener);
}

/** When a sitting that started at `startedAt` ends, or null when the timer is off. */
export function restTime(startedAt: number | null, minutes: number): number | null {
  return startedAt !== null && minutes > 0 ? startedAt + minutes * 60_000 : null;
}
