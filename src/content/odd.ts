import type { OddConfig } from '../engine';
import type { LoadedFeedback, LoadedItem, LoadedPack } from './types';
import { MIN_ITEMS_PER_PACK } from './validate';

export const ODD_PACK_ID = 'odd-one-out';
export const ODD_PACK_NAME = { en: 'Odd one out', ar: 'أين المختلف؟' } as const;

/** An easy game compares these packs of things (three animals and a car). */
const EASY_PACKS = ['animals', 'vehicles', 'food', 'instruments', 'home', 'body'];
/** A harder game stays inside one pack and compares its groups (three farm animals and a fish). */
const HARD_GROUPS: Readonly<Record<string, readonly string[]>> = {
  animals: ['farm', 'wild', 'birds', 'sea', 'bugs'],
  food: ['fruit', 'vegetables'],
};

/** Odd one out uses every picture of the packs above, never the parent's own packs. */
export function buildOddPack(packs: readonly LoadedPack[], feedback: LoadedFeedback): LoadedPack | null {
  const parts = packs.filter((p) => EASY_PACKS.includes(p.id) && p.kind === 'match' && p.items.length >= MIN_ITEMS_PER_PACK);
  if (parts.length < 2) return null;
  const items = [...new Map(parts.flatMap((p) => p.items).map((i): [string, LoadedItem] => [i.key, i])).values()];
  const easy: OddConfig = { families: [parts.map((p) => p.items.map((i) => i.key))] };
  const hardFamilies = parts.flatMap((p) => {
    const keys = new Set(p.items.map((i) => i.key));
    const pools = (HARD_GROUPS[p.id] ?? [])
      .map((id) => (p.groups.find((g) => g.id === id)?.items ?? []).filter((k) => keys.has(k)))
      .filter((pool) => pool.length >= 3);
    return pools.length >= 2 ? [pools] : [];
  });
  return {
    id: ODD_PACK_ID,
    version: 1,
    name: ODD_PACK_NAME,
    kind: 'match',
    order: 950,
    items,
    groups: [],
    feedback,
    parts,
    odd: { easy, hard: hardFamilies.length ? { families: hardFamilies } : easy },
  };
}
