import type { Question } from './questionGenerator';

/**
 * Spec 4.2: Presenting -> AwaitingTap -> (WrongTap -> AwaitingTap)* -> Celebrating -> Done.
 * "Presenting" also covers the short input guard after a question appears, so a finger that
 * is still tapping from the previous question can't land on the new one.
 */
export type QuestionPhase = 'presenting' | 'awaitingTap' | 'celebrating' | 'done';

export interface QuestionState {
  readonly question: Question;
  readonly phase: QuestionPhase;
  readonly faded: readonly string[];
  readonly attempts: number;
  /** True only if the target was tapped with no wrong tap and no hint before it. */
  readonly firstTryCorrect: boolean;
  /** A gentle hint (the right picture wiggling) was shown for this question. */
  readonly hinted: boolean;
  readonly toddlerMode: boolean;
  /** The option being celebrated: the target, or in toddler mode whatever was tapped. */
  readonly celebratedKey: string | null;
}

export type QuestionEvent =
  | { type: 'ready' }
  | { type: 'tap'; key: string }
  | { type: 'hint' }
  | { type: 'celebrationDone' };

export type TapOutcome = 'ignored' | 'wrong' | 'correct' | 'toddler';

export function startQuestion(question: Question, toddlerMode: boolean): QuestionState {
  return {
    question,
    phase: 'presenting',
    faded: [],
    attempts: 0,
    firstTryCorrect: true,
    hinted: false,
    toddlerMode,
    celebratedKey: null,
  };
}

/** Hints only make sense while the child is choosing, and never in toddler mode (every tap is right). */
export function canHint(state: QuestionState): boolean {
  return state.phase === 'awaitingTap' && !state.toddlerMode;
}

export function reduceQuestion(
  state: QuestionState,
  event: QuestionEvent,
): { state: QuestionState; outcome: TapOutcome | null } {
  switch (event.type) {
    case 'ready':
      return { state: state.phase === 'presenting' ? { ...state, phase: 'awaitingTap' } : state, outcome: null };
    case 'celebrationDone':
      return { state: state.phase === 'celebrating' ? { ...state, phase: 'done' } : state, outcome: null };
    case 'hint':
      return { state: canHint(state) ? { ...state, hinted: true } : state, outcome: null };
    case 'tap': {
      const { key } = event;
      if (state.phase !== 'awaitingTap') return { state, outcome: 'ignored' };
      if (!state.question.options.includes(key) || state.faded.includes(key)) return { state, outcome: 'ignored' };
      const attempts = state.attempts + 1;
      if (state.toddlerMode) {
        // Every tap celebrates the tapped animal; nothing fades.
        return {
          state: {
            ...state,
            phase: 'celebrating',
            attempts,
            celebratedKey: key,
            firstTryCorrect: key === state.question.targetKey,
          },
          outcome: 'toddler',
        };
      }
      if (key === state.question.targetKey) {
        return {
          state: {
            ...state,
            phase: 'celebrating',
            attempts,
            celebratedKey: key,
            // A hinted answer is a success, but not an unaided first try.
            firstTryCorrect: state.firstTryCorrect && !state.hinted,
          },
          outcome: 'correct',
        };
      }
      // Wrong: fade it. If only one option is left un-faded it stays tappable; the child still taps it.
      return {
        state: { ...state, faded: [...state.faded, key], attempts, firstTryCorrect: false },
        outcome: 'wrong',
      };
    }
  }
}
