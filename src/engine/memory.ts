import { shuffled, type Rng } from './random';

/**
 * The memory game: pairs of pictures face down. Turn two over; the same picture twice stays open,
 * two different ones turn back. No score and no time limit.
 */
export interface MemoryCard {
  readonly id: number;
  readonly key: string;
}

export interface MemoryState {
  readonly cards: readonly MemoryCard[];
  /** Face up and not yet matched (at most two). */
  readonly open: readonly number[];
  /** Keys whose pair has been found. */
  readonly matched: readonly string[];
  /** A turn is two cards. */
  readonly turns: number;
  /** 'checking': two different cards are showing, waiting to be turned back. */
  readonly phase: 'picking' | 'checking' | 'done';
}

export type FlipEvent = 'opened' | 'match' | 'miss' | 'done' | 'ignored';

export const MEMORY_PAIRS = [3, 4, 6] as const;
export type MemoryPairs = (typeof MEMORY_PAIRS)[number];

/** `pairs` different pictures from `keys`, each twice, shuffled. */
export function newMemoryGame(keys: readonly string[], pairs: number, rng: Rng): MemoryState {
  const unique = [...new Set(keys)];
  if (unique.length < 2) throw new Error('A memory game needs at least two pictures');
  const chosen = shuffled(unique, rng).slice(0, Math.min(pairs, unique.length));
  const cards = shuffled([...chosen, ...chosen], rng).map((key, id) => ({ id, key }));
  return { cards, open: [], matched: [], turns: 0, phase: 'picking' };
}

export function flip(state: MemoryState, id: number): { state: MemoryState; event: FlipEvent } {
  const card = state.cards.find((c) => c.id === id);
  if (state.phase !== 'picking' || !card || state.open.includes(id) || state.matched.includes(card.key)) {
    return { state, event: 'ignored' };
  }
  if (state.open.length === 0) return { state: { ...state, open: [id] }, event: 'opened' };

  const first = state.cards.find((c) => c.id === state.open[0])!;
  const turns = state.turns + 1;
  if (first.key !== card.key) return { state: { ...state, open: [first.id, id], turns, phase: 'checking' }, event: 'miss' };

  const matched = [...state.matched, card.key];
  const done = matched.length * 2 === state.cards.length;
  return { state: { ...state, open: [], matched, turns, phase: done ? 'done' : 'picking' }, event: done ? 'done' : 'match' };
}

/** After a miss: both cards turn back over. */
export function closeMiss(state: MemoryState): MemoryState {
  return state.phase === 'checking' ? { ...state, open: [], phase: 'picking' } : state;
}

/** Face up: matched pairs and the cards being looked at. */
export function isFaceUp(state: MemoryState, card: MemoryCard): boolean {
  return state.matched.includes(card.key) || state.open.includes(card.id);
}
