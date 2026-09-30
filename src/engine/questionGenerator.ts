import { ConfusionGraph } from './confusion';
import { randomInt, shuffled, type Rng } from './random';
import type { ChoiceCount, EngineItem } from './types';

export interface Question {
  readonly targetKey: string;
  /** Item keys in display order, including the target. */
  readonly options: readonly string[];
  /** Association games: what the question is about ("rabbit" when the answer is the carrot). */
  readonly promptKey?: string;
}

export interface GenerateOptions {
  items: readonly EngineItem[];
  choiceCount: ChoiceCount;
  previousTargetKey: string | null;
  rng: Rng;
  /** Normally supplied by the session's TargetBag; if absent a random target (not the previous one) is picked. */
  targetKey?: string;
  graph?: ConfusionGraph;
  /** Association games: the previous question's prompt, avoided when the answer has others. */
  previousPromptKey?: string | null;
}

/** Spec 4.1 step 1: a random target, excluding the previous question's target. */
export function pickTarget(items: readonly EngineItem[], previousTargetKey: string | null, rng: Rng): string {
  const candidates = items.filter((i) => i.key !== previousTargetKey);
  const pool = candidates.length > 0 ? candidates : items;
  return pool[randomInt(rng, pool.length)].key;
}

export function generateQuestion(opts: GenerateOptions): Question {
  const { items, choiceCount, previousTargetKey, rng } = opts;
  if (items.length === 0) throw new Error('Cannot build a question from an empty pack');
  const graph = opts.graph ?? new ConfusionGraph(items);
  const targetKey = opts.targetKey ?? pickTarget(items, previousTargetKey, rng);

  const target = items.find((i) => i.key === targetKey);
  const promptKey = pickPrompt(target?.prompts ?? [], opts.previousPromptKey ?? null, rng);

  // Spec 4.1 step 2: everything except the target and anything confusable with it.
  const pool = items
    .filter((i) => i.key !== targetKey && !graph.areConfusable(targetKey, i.key))
    // Association: never offer another answer that also goes with this prompt (horses eat apples and carrots).
    .filter((i) => promptKey === undefined || !(i.prompts ?? []).includes(promptKey))
    // Mixed game: wrong answers come from the same group as the right one.
    .filter((i) => target?.group === undefined || i.group === target.group)
    .map((i) => i.key);

  // Steps 3-4: distractors that are not confusable with each other, then shuffle positions.
  const distractors = pickNonConfusable(shuffled(pool, rng), choiceCount - 1, graph);
  const options = shuffled([targetKey, ...distractors], rng);
  return promptKey === undefined ? { targetKey, options } : { targetKey, options, promptKey };
}

/** One of the answer's prompt items, preferably not the one the previous question was about. */
function pickPrompt(prompts: readonly string[], previous: string | null, rng: Rng): string | undefined {
  if (!prompts.length) return undefined;
  const fresh = prompts.filter((p) => p !== previous);
  const pool = fresh.length ? fresh : prompts;
  return pool[randomInt(rng, pool.length)];
}

/**
 * Picks `count` candidates, no two confusable with each other. Candidates arrive already
 * shuffled, so the first valid combination found is a random one. If no combination of that
 * size exists (a small pack with many confusable pairs), falls back to fewer choices instead
 * of failing.
 */
export function pickNonConfusable(candidates: readonly string[], count: number, graph: ConfusionGraph): string[] {
  for (let want = Math.min(count, candidates.length); want >= 1; want--) {
    const found = search(candidates, want, graph, 0, []);
    if (found) return found;
  }
  return [];
}

function search(
  candidates: readonly string[],
  want: number,
  graph: ConfusionGraph,
  start: number,
  chosen: string[],
): string[] | null {
  if (chosen.length === want) return chosen;
  for (let i = start; i < candidates.length; i++) {
    const c = candidates[i];
    if (chosen.some((x) => graph.areConfusable(x, c))) continue;
    const found = search(candidates, want, graph, i + 1, [...chosen, c]);
    if (found) return found;
  }
  return null;
}
