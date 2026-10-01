import { describe, expect, it } from 'vitest';
import type { LoadedItem, LoadedPack, ResolvedAsset } from '../../content/types';
import { choosePictures } from '../kid/layout';
import { LINES, studioClips, studioSavePath } from './studioClips';

const asset = (path: string, real = false): ResolvedAsset => ({ path, url: `/${path}`, real });
const item = (key: string, folder: string, sound = false): LoadedItem => ({
  key,
  name: { en: key, ar: `${key}-ar` },
  images: [asset(`packs/${folder}/${key}.webp`)],
  placeholderImage: null,
  sound: sound ? asset(`packs/${folder}/${key}_sound.mp3`) : null,
  nameAudio: { ar: asset(`packs/${folder}/${key}_name_ar.mp3`, key === 'cat'), en: asset(`packs/${folder}/${key}_name_en.mp3`) },
  confusableWith: [],
});
const pack = (id: string, items: LoadedItem[], extra: Partial<LoadedPack> = {}): LoadedPack => ({
  id,
  version: 1,
  name: { en: id, ar: id },
  kind: 'match',
  order: 1,
  items,
  groups: [],
  feedback: {
    correct: { ar: [asset('feedback/correct_ar_1.mp3')], en: [asset('feedback/correct_en_1.mp3')] },
    incorrectTone: asset('feedback/incorrect_tone.mp3'),
    sessionEnd: { ar: asset('feedback/session_end_ar.mp3'), en: null },
  },
  ...extra,
});

describe('recording studio', () => {
  it('lists every name, sound and line once, with what to say', () => {
    const animals = pack('animals', [item('cat', 'animals', true), item('cow', 'animals', true)]);
    const food = pack('food', [item('carrot', 'food')]);
    const whoEats = pack('who-eats-what', [item('carrot', 'food')], {
      kind: 'association',
      association: { promptPackId: 'animals', question: { ar: asset('feedback/eat_question_ar.mp3'), en: null }, questionFeminine: { ar: null, en: null }, reward: asset('feedback/yum.mp3') },
    });
    const clips = studioClips([animals, food, whoEats]);
    const paths = clips.map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length); // the shared carrot is listed once
    expect(clips.find((c) => c.path === 'packs/food/carrot_name_ar.mp3')).toMatchObject({ packId: 'food', kind: 'ar', say: 'carrot-ar' });
    expect(clips.find((c) => c.path === 'packs/animals/cat_name_ar.mp3')!.real).toBe(true);
    expect(clips.find((c) => c.path === 'feedback/correct_ar_1.mp3')).toMatchObject({ packId: LINES, kind: 'ar', say: 'جميل!' });
    expect(clips.find((c) => c.path === 'feedback/eat_question_ar.mp3')!.say).toBe('ماذا يأكل؟');
    expect(clips.filter((c) => c.kind === 'sound').map((c) => c.path)).toEqual([
      'packs/animals/cat_sound.mp3',
      'packs/animals/cow_sound.mp3',
      'feedback/incorrect_tone.mp3',
      'feedback/yum.mp3',
    ]);
  });

  it('saves next to the manifest file, as WAV', () => {
    expect(studioSavePath('packs/animals/cat_name_ar.mp3')).toBe('packs/animals/cat_name_ar.wav');
    expect(studioSavePath('feedback/correct_en_1.mp3')).toBe('feedback/correct_en_1.wav');
  });
});

describe('pictures drawn as a series', () => {
  it('uses the same kind for every picture in a question (3 apples next to 5 apples)', () => {
    const counting = (n: number): LoadedItem => ({
      ...item(`count_${n}`, 'counting'),
      images: ['dots', 'apples', 'stars'].map((t) => asset(`packs/counting/count_${n}_${t}.svg`, true)),
    });
    for (const r of [0, 0.4, 0.9]) {
      const pics = choosePictures([counting(1), counting(3), counting(5)], () => r);
      const kinds = new Set(Object.values(pics).map((url) => url.split('_').pop()));
      expect(kinds.size).toBe(1);
    }
  });
});
