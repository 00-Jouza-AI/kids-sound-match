import { shuffled, type Rng } from './random';

/**
 * Deals every item in random order before starting a new round, so a 10-question game over
 * 24 animals never asks for the cat three times while skipping others. Never returns the
 * previous target (when there is more than one item).
 *
 * Adaptive practice: an item's weight says how often it is dealt per round. 2 = twice (an
 * animal the child keeps missing), 1 = once, 0.5 = every other round on average (one the
 * child knows well). Missing weights count as 1.
 */
export class TargetBag {
  private remaining: string[];

  constructor(
    private readonly keys: readonly string[],
    private readonly rng: Rng,
    remaining?: readonly string[],
    private readonly weights: Readonly<Record<string, number>> = {},
  ) {
    this.remaining = remaining ? remaining.filter((k) => keys.includes(k)) : [];
  }

  next(previous: string | null): string {
    if (this.keys.length === 1) return this.keys[0];
    if (this.remaining.every((k) => k === previous)) this.remaining = this.newRound();
    let i = this.remaining.findIndex((k) => k !== previous);
    if (i < 0) {
      // A weighted round that happened to hold only the previous target: fall back to a plain round.
      this.remaining = shuffled(this.keys, this.rng);
      i = this.remaining.findIndex((k) => k !== previous);
    }
    return this.remaining.splice(i, 1)[0];
  }

  snapshot(): string[] {
    return this.remaining.slice();
  }

  private newRound(): string[] {
    const round: string[] = [];
    for (const key of this.keys) {
      const weight = Math.max(0, this.weights[key] ?? 1);
      const whole = Math.floor(weight);
      for (let n = 0; n < whole; n++) round.push(key);
      if (this.rng.next() < weight - whole) round.push(key);
    }
    return shuffled(round.length ? round : this.keys, this.rng);
  }
}
