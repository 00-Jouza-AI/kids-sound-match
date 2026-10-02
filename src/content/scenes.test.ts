import { describe, expect, it } from 'vitest';
import { seededRng as engineRng } from '../engine';
import { layoutScene, sceneCandidates, sceneCapacity, sceneQuestionOrder, SCENES, type SceneDef } from './scenes';
import type { LoadedItem, LoadedPack } from './types';

/** A repeatable stand-in for Math.random. */
const seededRng = (seed: number) => {
  const r = engineRng(seed);
  return () => r.next();
};

const item = (key: string, confusableWith: string[] = []): LoadedItem => ({
  key,
  name: { en: key, ar: key },
  images: [],
  placeholderImage: null,
  sound: null,
  nameAudio: { ar: { path: `${key}_ar`, url: '', real: false }, en: { path: `${key}_en`, url: '', real: false } },
  confusableWith,
});
const pack = (id: string, items: LoadedItem[]): LoadedPack => ({
  id,
  version: 1,
  name: { en: id, ar: id },
  kind: 'match',
  order: 1,
  items,
  groups: [],
  feedback: { correct: { ar: [], en: [] }, incorrectTone: null, sessionEnd: { ar: null, en: null } },
});

const farm = SCENES.find((s) => s.id === 'farm')!;
const house = SCENES.find((s) => s.id === 'house')!;
const animals = pack('animals', [
  ...['cow', 'horse', 'donkey', 'hen', 'rooster', 'chick', 'duck', 'frog', 'bird', 'owl', 'dog', 'cat', 'camel', 'bee'].map((k) => item(k)),
  item('sheep', ['goat']),
  item('goat', ['sheep']),
  item('lion'), // not a farm animal: never placed
]);

describe('Find it in the picture: putting things in a scene', () => {
  it('only shows each thing once, in a spot where it belongs', () => {
    const candidates = sceneCandidates(farm, [animals]);
    expect(candidates.has('lion')).toBe(false);
    for (let seed = 1; seed < 200; seed++) {
      const placed = layoutScene(farm, candidates, 6, seededRng(seed));
      expect(placed).toHaveLength(6);
      expect(new Set(placed.map((p) => p.item.key)).size).toBe(6);
      expect(new Set(placed.map((p) => p.spot)).size).toBe(6);
      for (const p of placed) expect(farm.spots.find((s) => s.id === p.spot)!.accepts).toContain(p.item.key);
    }
  });

  it('never puts two look-alikes in one scene (a sheep and a goat; a clock and an alarm clock)', () => {
    const candidates = sceneCandidates(farm, [animals]);
    for (let seed = 1; seed < 300; seed++) {
      const keys = layoutScene(farm, candidates, 6, seededRng(seed)).map((p) => p.item.key);
      expect(keys.includes('sheep') && keys.includes('goat')).toBe(false);
    }
    const home = pack('home', [item('clock'), item('alarm_clock'), item('phone'), item('keys'), item('door')]);
    const housed = sceneCandidates(house, [home]);
    for (let seed = 1; seed < 300; seed++) {
      const keys = layoutScene(house, housed, 6, seededRng(seed)).map((p) => p.item.key);
      expect(keys.includes('clock') && keys.includes('alarm_clock')).toBe(false);
    }
  });

  it('spreads things out: the 4 to 6 things of a game each in a different area of the farm', () => {
    const candidates = sceneCandidates(farm, [animals]);
    for (let seed = 1; seed < 100; seed++) {
      const placed = layoutScene(farm, candidates, 5, seededRng(seed));
      const used = placed.map((p) => farm.spots.find((s) => s.id === p.spot)!.area);
      expect(new Set(used).size).toBe(used.length);
    }
  });

  it('keeps to the things the parent allowed, and says how many fit', () => {
    const onlyBirds = sceneCandidates(farm, [animals], (_, i) => ['bird', 'owl', 'duck'].includes(i.key));
    expect([...onlyBirds.keys()].sort()).toEqual(['bird', 'duck', 'owl']);
    expect(sceneCapacity(farm, onlyBirds)).toBe(3);
    expect(sceneCapacity(farm, sceneCandidates(farm, []))).toBe(0);
  });

  it('takes the house from First words, Things at home and Family together', () => {
    const firstWords = pack('first-words', [item('bed'), item('teddy'), item('bath'), item('cup')]);
    const home = pack('home', [item('toothbrush'), item('kettle'), item('clock')]);
    const family = pack('family', [item('mama'), item('baba')]);
    const candidates = sceneCandidates(house, [firstWords, home, family]);
    expect(candidates.get('mama')?.packId).toBe('family');
    expect(candidates.get('bed')?.packId).toBe('first-words');
    const placed = layoutScene(house, candidates, 6, seededRng(4));
    const rooms = new Set(placed.map((p) => house.spots.find((s) => s.id === p.spot)!.area));
    expect(rooms.size).toBe(4); // every room has something
  });

  it('asks for every thing in turn, never the same twice in a row', () => {
    const keys = ['cow', 'duck', 'hen', 'dog'];
    for (let seed = 1; seed < 100; seed++) {
      const order = sceneQuestionOrder(keys, 10, seededRng(seed));
      expect(order).toHaveLength(10);
      expect(new Set(order.slice(0, 4))).toEqual(new Set(keys));
      for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    }
    expect(sceneQuestionOrder([], 5, seededRng(1))).toEqual([]);
  });

  it('every spot accepts something, and spot ids are unique in each scene', () => {
    for (const scene of SCENES as readonly SceneDef[]) {
      expect(new Set(scene.spots.map((s) => s.id)).size).toBe(scene.spots.length);
      for (const s of scene.spots) expect(s.accepts.length).toBeGreaterThan(0);
    }
  });
});
