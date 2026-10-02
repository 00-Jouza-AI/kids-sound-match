import type { LoadedItem, LoadedPack, LocalizedText } from './types';

export type SceneId = 'farm' | 'house';

/** A place in a scene where one thing can stand: the pond, the barn door, the bathroom wall... */
export interface SceneSpot {
  readonly id: string;
  /** Spots in the same area (the sky, a room) are filled one at a time, so things spread out. */
  readonly area: string;
  /** What belongs here (item keys from the scene's packs), so the duck is in the pond, not the sky. */
  readonly accepts: readonly string[];
}

export interface SceneDef {
  readonly id: SceneId;
  readonly name: LocalizedText;
  /** The packs its things come from, in order: the first one found provides the praise lines. */
  readonly packs: readonly string[];
  readonly spots: readonly SceneSpot[];
  /** Things too alike to look for in the same scene, though their packs don't say so (a clock and an alarm clock). */
  readonly apart?: readonly (readonly [string, string])[];
}

const BIG_FARM = ['cow', 'horse', 'sheep', 'goat', 'donkey', 'camel', 'turkey', 'dog'];
const FLYING = ['bird', 'pigeon', 'butterfly', 'bee', 'eagle'];
const PEOPLE = ['mama', 'baba', 'grandma', 'grandpa', 'brother', 'sister', 'baby'];

const FARM: SceneDef = {
  id: 'farm',
  name: { en: 'Farm', ar: 'المزرعة' },
  packs: ['animals'],
  spots: [
    { id: 'sky1', area: 'sky', accepts: FLYING },
    { id: 'sky2', area: 'sky', accepts: FLYING },
    { id: 'tree', area: 'tree', accepts: ['owl', 'bird', 'pigeon', 'parrot'] },
    { id: 'barn', area: 'barn', accepts: ['horse', 'cow', 'donkey', 'sheep', 'goat', 'dog', 'cat'] },
    { id: 'fence', area: 'fence', accepts: ['rooster', 'cat', 'bird', 'pigeon'] },
    { id: 'field1', area: 'field', accepts: BIG_FARM },
    { id: 'field2', area: 'field', accepts: BIG_FARM },
    { id: 'near1', area: 'near', accepts: ['hen', 'rooster', 'chick', 'rabbit', 'dog', 'cat', 'turkey', 'goose', 'turtle'] },
    { id: 'near2', area: 'near', accepts: ['hen', 'rooster', 'chick', 'rabbit', 'goose', 'turkey', 'sheep', 'goat'] },
    { id: 'pond', area: 'pond', accepts: ['duck', 'goose', 'frog'] },
  ],
};

/** A doll's house: bedroom and bathroom upstairs, kitchen and living room downstairs. */
const HOUSE: SceneDef = {
  id: 'house',
  name: { en: 'House', ar: 'البيت' },
  packs: ['first-words', 'home', 'family'],
  spots: [
    { id: 'bed1', area: 'bedroom', accepts: ['bed', 'teddy', 'ball', 'book', 'shoe', 'socks'] },
    { id: 'bed2', area: 'bedroom', accepts: ['teddy', 'ball', 'book', 'shoe', 'socks', 'hat', 'balloon', 'alarm_clock'] },
    { id: 'bath1', area: 'bathroom', accepts: ['bath'] },
    { id: 'bath2', area: 'bathroom', accepts: ['toothbrush', 'bubbles', 'shower', 'tap'] },
    { id: 'kit1', area: 'kitchen', accepts: ['chair', ...PEOPLE] },
    { id: 'kit2', area: 'kitchen', accepts: ['cup', 'spoon', 'bottle', 'kettle', 'frying_pan', 'tap'] },
    { id: 'liv1', area: 'living', accepts: [...PEOPLE, 'chair', 'ball', 'teddy'] },
    { id: 'liv2', area: 'living', accepts: ['door', ...PEOPLE] },
    { id: 'liv3', area: 'living', accepts: ['clock', 'phone', 'camera', 'keys', 'doorbell'] },
  ],
  apart: [['clock', 'alarm_clock']],
};

export const SCENES: readonly SceneDef[] = [FARM, HOUSE];

/** Fewer than this and there's nothing to look for. */
export const MIN_SCENE_THINGS = 3;
/** The most things in one scene, whatever the picture setting: more is too busy for a toddler. */
export const MAX_SCENE_THINGS = 6;

export interface SceneCandidate {
  readonly packId: string;
  readonly item: LoadedItem;
}

export interface SceneThing extends SceneCandidate {
  readonly spot: string;
}

/**
 * What can appear in a scene: every item a spot accepts, from the scene's packs, that `allowed`
 * lets in (the parent's picture selection and the "What your child hears" setting).
 */
export function sceneCandidates(
  scene: SceneDef,
  packs: readonly LoadedPack[],
  allowed: (packId: string, item: LoadedItem) => boolean = () => true,
): Map<string, SceneCandidate> {
  const wanted = new Set(scene.spots.flatMap((s) => s.accepts));
  const out = new Map<string, SceneCandidate>();
  for (const packId of scene.packs) {
    const pack = packs.find((p) => p.id === packId);
    for (const item of pack?.items ?? []) {
      if (wanted.has(item.key) && !out.has(item.key) && allowed(packId, item)) out.set(item.key, { packId, item });
    }
  }
  return out;
}

/** How many different things a scene can show at once. */
export function sceneCapacity(scene: SceneDef, candidates: ReadonlyMap<string, SceneCandidate>): number {
  return layoutScene(scene, candidates, scene.spots.length, () => 0).length;
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Puts up to `count` different things into the scene: one area at a time (the sky, the barn, the
 * field...) so they spread out, each in a spot where it belongs, never two that look or sound
 * alike (a sheep and a goat).
 */
export function layoutScene(
  scene: SceneDef,
  candidates: ReadonlyMap<string, SceneCandidate>,
  count: number,
  random: () => number,
): SceneThing[] {
  const byArea = new Map<string, SceneSpot[]>();
  for (const spot of shuffled(scene.spots, random)) byArea.set(spot.area, [...(byArea.get(spot.area) ?? []), spot]);
  const areas = shuffled([...byArea.keys()], random);
  const order: SceneSpot[] = [];
  for (let round = 0; order.length < scene.spots.length; round++) {
    for (const area of areas) {
      const spot = byArea.get(area)![round];
      if (spot) order.push(spot);
    }
  }

  const placed: SceneThing[] = [];
  for (const spot of order) {
    if (placed.length >= count) break;
    const options = spot.accepts.filter((key) => {
      const c = candidates.get(key);
      if (!c || placed.some((p) => p.item.key === key)) return false;
      return !placed.some(
        (p) =>
          p.item.confusableWith.includes(key) ||
          c.item.confusableWith.includes(p.item.key) ||
          (scene.apart ?? []).some(([a, b]) => (a === key && b === p.item.key) || (b === key && a === p.item.key)),
      );
    });
    if (!options.length) continue;
    const key = options[Math.floor(random() * options.length)];
    placed.push({ ...candidates.get(key)!, spot: spot.id });
  }
  return placed;
}

/** The order things are asked for: each one in turn, shuffled, never the same twice in a row. */
export function sceneQuestionOrder(keys: readonly string[], total: number, random: () => number): string[] {
  const out: string[] = [];
  if (!keys.length) return out;
  while (out.length < total) {
    let round = shuffled(keys, random);
    if (keys.length > 1 && round[0] === out[out.length - 1]) round = [...round.slice(1), round[0]];
    out.push(...round);
  }
  return out.slice(0, total);
}
