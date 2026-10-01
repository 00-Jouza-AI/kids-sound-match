import { isCustomPackId } from '../custom/types';
import type { LoadedFeedback, LoadedItem, LoadedPack } from './types';
import { MIN_ITEMS_PER_PACK } from './validate';

export const MIXED_PACK_ID = 'mixed';
export const MIXED_PACK_NAME = { en: 'Mixed', ar: 'منوّعات' } as const;

/**
 * Sounds from different packs that are too alike to be asked side by side in the Mixed game
 * (pairs inside one pack are already in its manifest).
 */
const CROSS_PACK_CONFUSABLE: readonly (readonly [string, string])[] = [
  ['bell', 'doorbell'],
  ['bell', 'alarm_clock'],
  ['bell', 'phone'],
  ['drum', 'door'],
  ['drum', 'hammer'],
  ['darbuka', 'door'],
  ['darbuka', 'hammer'],
  ['trumpet', 'elephant'],
  ['snake', 'frying_pan'],
  ['snake', 'shower'],
];

/**
 * The Mixed game: every ready "match" pack in one game (animals, things at home, the parent's own
 * packs...), except packs that opt out (Counting). Each question's wrong answers come from the same
 * group as the right one (see `mixedGroups`).
 */
export function buildMixedPack(packs: readonly LoadedPack[], feedback: LoadedFeedback): LoadedPack | null {
  const parts = packs.filter(
    (p) => p.kind === 'match' && !p.parts && p.inMix !== false && p.items.length >= MIN_ITEMS_PER_PACK,
  );
  if (parts.length < 2) return null;
  const seen = new Set<string>();
  const items: LoadedItem[] = [];
  for (const part of parts) {
    for (const item of part.items) {
      // Keys are unique across packs; this only guards against a content mistake.
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push(item);
    }
  }
  const extra = new Map<string, string[]>();
  for (const [a, b] of CROSS_PACK_CONFUSABLE) {
    if (!seen.has(a) || !seen.has(b)) continue;
    extra.set(a, [...(extra.get(a) ?? []), b]);
    extra.set(b, [...(extra.get(b) ?? []), a]);
  }
  return {
    id: MIXED_PACK_ID,
    version: 1,
    name: MIXED_PACK_NAME,
    kind: 'match',
    order: 900,
    items: items.map((i) => (extra.has(i.key) ? { ...i, confusableWith: [...i.confusableWith, ...extra.get(i.key)!] } : i)),
    groups: [],
    feedback,
    parts,
  };
}

/** Which pack each item of the Mixed game came from (for the Report). Empty for other packs. */
export function sourcePacks(pack: LoadedPack): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of pack.parts ?? []) for (const item of part.items) if (!map.has(item.key)) map.set(item.key, part.id);
  return map;
}

/**
 * Mixed game: which pictures may share a question. The built-in packs of things form one group;
 * the parent's own packs another (their photos stay together); and colours, shapes and feelings
 * each keep to themselves. Empty for other packs.
 */
export function mixedGroups(pack: LoadedPack): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of pack.parts ?? []) {
    const group = part.mixAlone ? `pack:${part.id}` : isCustomPackId(part.id) ? 'custom' : 'builtin';
    for (const item of part.items) if (!map.has(item.key)) map.set(item.key, group);
  }
  return map;
}
