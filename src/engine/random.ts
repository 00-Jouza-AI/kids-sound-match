/** Source of randomness. Injected everywhere so tests are deterministic. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
}

export interface SeededRng extends Rng {
  /** Internal state; passing it back to seededRng() continues the same sequence. */
  state(): number;
}

/** mulberry32: tiny and fast, plenty for shuffling pictures. */
export function seededRng(seed: number): SeededRng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive);
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
