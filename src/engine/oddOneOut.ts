import type { Question } from './questionGenerator';
import { randomInt, shuffled, type Rng } from './random';

/**
 * Odd one out: some pictures of one kind and one of another ("three animals and a car").
 * Families are tried one at a time: in an easy game one family holds a pool per pack (animals,
 * vehicles, food...); in a harder game each pack is its own family, with a pool per group (farm,
 * sea, birds... or fruit, vegetables), so the odd one is still an animal, just not a farm animal.
 */
export interface OddConfig {
  readonly families: readonly (readonly (readonly string[])[])[];
}

/**
 * `size` pictures: size - 1 from one pool, and one that shares no pool with all of them. Pools can
 * overlap (a duck is a farm animal and a bird), so the odd one is checked against every pool the
 * others share: among a duck and a hen, a cow isn't odd (all farm animals), a fish is.
 */
export function oddQuestion(config: OddConfig, size: number, rng: Rng, previousTarget: string | null): Question {
  const same = size - 1;
  const families = config.families.filter((f) => f.length >= 2 && f.some((p) => p.length >= same));
  for (const family of shuffled(families, rng)) {
    const all = [...new Set(family.flat())];
    for (const pool of shuffled(family.filter((p) => p.length >= same), rng)) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const others = shuffled(pool, rng).slice(0, same);
        const shared = family.filter((p) => others.every((k) => p.includes(k)));
        const odd = all.filter((k) => !shared.some((p) => p.includes(k)));
        if (!odd.length) continue;
        const fresh = odd.filter((k) => k !== previousTarget);
        const choices = fresh.length ? fresh : odd;
        const targetKey = choices[randomInt(rng, choices.length)];
        return { targetKey, options: shuffled([...others, targetKey], rng) };
      }
    }
  }
  throw new Error('Odd one out needs a family with two kinds of pictures');
}
