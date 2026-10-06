import { ConfusionGraph } from './confusion';
import { oddQuestion, type OddConfig } from './oddOneOut';
import { generateQuestion, type Question } from './questionGenerator';
import { canHint, reduceQuestion, startQuestion, type QuestionState, type TapOutcome } from './questionMachine';
import { seededRng, type SeededRng } from './random';
import { TargetBag } from './targetBag';
import type { ChoiceCount, EngineItem } from './types';

export interface SessionConfig {
  readonly items: readonly EngineItem[];
  readonly choiceCount: ChoiceCount;
  readonly questionsPerSession: number;
  readonly toddlerMode: boolean;
  /** Adaptive practice: how often each item is dealt per round (see TargetBag). */
  readonly weights?: Readonly<Record<string, number>>;
  /** Odd one out: questions come from these pools instead of a target and distractors. */
  readonly odd?: OddConfig;
}

export interface QuestionResult {
  readonly itemKey: string;
  readonly firstTryCorrect: boolean;
  readonly attempts: number;
  /** Options actually shown; can be below the setting if a small pack forced a fallback. */
  readonly choiceCount: number;
  /** The right picture wiggled before the child found it. */
  readonly hinted: boolean;
  /** Association games: what the question was about (the animal, when the answer was its food). */
  readonly promptKey?: string;
}

export interface SessionResult {
  readonly toddlerMode: boolean;
  readonly questions: readonly QuestionResult[];
}

/** Everything needed to rebuild a session after a page reload. Plain JSON. */
export interface SessionSnapshot {
  readonly results: readonly QuestionResult[];
  readonly current: Question;
  readonly upcoming: Question | null;
  readonly lastTarget: string | null;
  /** Association games. Missing in snapshots saved before they existed. */
  readonly lastPrompt?: string | null;
  readonly bagRemaining: readonly string[];
  readonly rngState: number;
}

export type AdvanceResult = 'next' | 'end' | 'ignored';

export class GameSession {
  private readonly graph: ConfusionGraph;
  private readonly rng: SeededRng;
  private readonly bag: TargetBag;
  private readonly _results: QuestionResult[];
  private _current: QuestionState;
  /** Generated one question ahead so its clips can be preloaded. */
  private _upcoming: Question | null;
  private lastTarget: string | null;
  private lastPrompt: string | null;

  constructor(
    readonly config: SessionConfig,
    seed: number,
    snapshot?: SessionSnapshot,
  ) {
    if (config.items.length === 0) throw new Error('A session needs at least one item');
    if (config.questionsPerSession < 1) throw new Error('A session needs at least one question');
    this.graph = new ConfusionGraph(config.items);
    this.rng = seededRng(snapshot ? snapshot.rngState : seed);
    this.bag = new TargetBag(
      config.items.map((i) => i.key),
      this.rng,
      snapshot?.bagRemaining,
      config.weights,
    );
    if (snapshot) {
      this._results = snapshot.results.slice();
      this.lastTarget = snapshot.lastTarget;
      this.lastPrompt = snapshot.lastPrompt ?? null;
      this._current = startQuestion(snapshot.current, config.toddlerMode);
      this._upcoming = snapshot.upcoming;
    } else {
      this._results = [];
      this.lastTarget = null;
      this.lastPrompt = null;
      this._current = startQuestion(this.makeQuestion(), config.toddlerMode);
      this._upcoming = this.questionsAfterCurrent() > 0 ? this.makeQuestion() : null;
    }
  }

  get current(): QuestionState {
    return this._current;
  }

  get upcoming(): Question | null {
    return this._upcoming;
  }

  get results(): readonly QuestionResult[] {
    return this._results;
  }

  /** 0-based index of the question on screen. */
  get index(): number {
    return this._results.length;
  }

  get total(): number {
    return this.config.questionsPerSession;
  }

  get isOver(): boolean {
    return this._results.length >= this.total;
  }

  /** Ends the input guard: taps are accepted from now on. */
  ready(): void {
    this._current = reduceQuestion(this._current, { type: 'ready' }).state;
  }

  /** Shows a gentle hint for the current question. Returns false when a hint makes no sense now. */
  hint(): boolean {
    if (this.isOver || !canHint(this._current)) return false;
    this._current = reduceQuestion(this._current, { type: 'hint' }).state;
    return true;
  }

  tap(key: string): TapOutcome {
    if (this.isOver) return 'ignored';
    const { state, outcome } = reduceQuestion(this._current, { type: 'tap', key });
    this._current = state;
    return outcome ?? 'ignored';
  }

  /** Call once the celebration has finished. Only the first call per celebration advances. */
  finishCelebration(): AdvanceResult {
    if (this.isOver || this._current.phase !== 'celebrating') return 'ignored';
    const done = reduceQuestion(this._current, { type: 'celebrationDone' }).state;
    this._results.push({
      itemKey: done.question.targetKey,
      firstTryCorrect: done.firstTryCorrect,
      attempts: done.attempts,
      choiceCount: done.question.options.length,
      hinted: done.hinted,
      ...(done.question.promptKey !== undefined ? { promptKey: done.question.promptKey } : {}),
    });
    this._current = done;
    if (this.isOver) return 'end';
    this._current = startQuestion(this._upcoming ?? this.makeQuestion(), this.config.toddlerMode);
    this._upcoming = this.questionsAfterCurrent() > 0 ? this.makeQuestion() : null;
    return 'next';
  }

  result(): SessionResult {
    return { toddlerMode: this.config.toddlerMode, questions: this._results.slice() };
  }

  snapshot(): SessionSnapshot {
    return {
      results: this._results.slice(),
      current: this._current.question,
      upcoming: this._upcoming,
      lastTarget: this.lastTarget,
      lastPrompt: this.lastPrompt,
      bagRemaining: this.bag.snapshot(),
      rngState: this.rng.state(),
    };
  }

  private questionsAfterCurrent(): number {
    return this.total - this._results.length - 1;
  }

  private makeQuestion(): Question {
    if (this.config.odd) {
      // 3 or 4 pictures: two or three alike and the different one, whatever the picture setting.
      const question = oddQuestion(this.config.odd, Math.min(4, Math.max(3, this.config.choiceCount)), this.rng, this.lastTarget);
      this.lastTarget = question.targetKey;
      return question;
    }
    const targetKey = this.bag.next(this.lastTarget);
    const question = generateQuestion({
      items: this.config.items,
      choiceCount: this.config.choiceCount,
      previousTargetKey: this.lastTarget,
      rng: this.rng,
      targetKey,
      graph: this.graph,
      previousPromptKey: this.lastPrompt,
    });
    this.lastTarget = targetKey;
    this.lastPrompt = question.promptKey ?? null;
    return question;
  }
}
