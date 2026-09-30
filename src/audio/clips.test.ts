import { describe, expect, it } from 'vitest';
import type { LoadedItem, LoadedPack, ResolvedAsset } from '../content/types';
import { ClipResolver, type Clip } from './clips';

const asset = (path: string): ResolvedAsset => ({ path, url: `/${path}`, real: true });
const animal = (key: string, arFeminine: boolean): LoadedItem => ({
  key,
  name: { en: key, ar: key },
  images: [],
  placeholderImage: null,
  sound: asset(`${key}_sound.mp3`),
  nameAudio: { ar: asset(`${key}_ar.mp3`), en: asset(`${key}_en.mp3`) },
  confusableWith: [],
  arFeminine,
});
const whoEats: LoadedPack = {
  id: 'who-eats-what',
  version: 1,
  name: { en: 'Who eats what?', ar: 'من يأكل ماذا؟' },
  kind: 'association',
  order: 8,
  association: {
    promptPackId: 'animals',
    question: { ar: asset('q_ar.mp3'), en: asset('q_en.mp3') },
    questionFeminine: { ar: asset('q_ar_f.mp3'), en: null },
    reward: asset('yum.mp3'),
  },
  items: [],
  groups: [],
  feedback: { correct: { ar: [], en: [] }, incorrectTone: null, sessionEnd: { ar: null, en: null } },
};
const urls = (clips: Clip[]) => clips.map((c) => (c.kind === 'file' ? c.url : c.text));

describe('"Who eats what?" clips', () => {
  it('asks in the animal\'s grammatical gender: ماذا يأكل؟ for a horse, ماذا تأكل؟ for a cow', () => {
    const arabic = new ClipResolver(whoEats, ['ar']);
    expect(urls(arabic.askAbout(animal('horse', false)))).toEqual(['/horse_ar.mp3', '/q_ar.mp3']);
    expect(urls(arabic.askAbout(animal('cow', true)))).toEqual(['/cow_ar.mp3', '/q_ar_f.mp3']);
  });

  it('says the name and question in each language for "Both", and English has one question', () => {
    const both = new ClipResolver(whoEats, ['ar', 'en']);
    expect(urls(both.askAbout(animal('cow', true)))).toEqual(['/cow_ar.mp3', '/q_ar_f.mp3', '/cow_en.mp3', '/q_en.mp3']);
    expect(both.reward()).toMatchObject({ kind: 'file', url: '/yum.mp3' });
  });
});
