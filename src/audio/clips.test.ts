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

describe('Peekaboo and "Where\'s your nose?" lines', () => {
  const nose: LoadedItem = {
    ...animal('nose', false),
    point: {
      en: { text: "Where's your nose?", audio: asset('nose_point_en.mp3') },
      ar_f: { text: 'أين أنفُكِ؟', audio: asset('nose_point_ar_f.mp3') },
      ar_m: { text: 'أين أنفُكَ؟', audio: asset('nose_point_ar_m.mp3') },
    },
  };
  const body: LoadedPack = { ...whoEats, id: 'body', kind: 'match', association: undefined };

  it('asks a girl أين أنفُكِ؟ and a boy أين أنفُكَ؟, then English for "Both"', () => {
    expect(urls(new ClipResolver(body, ['ar']).pointQuestion(nose, 'f'))).toEqual(['/nose_point_ar_f.mp3']);
    expect(urls(new ClipResolver(body, ['ar']).pointQuestion(nose, 'm'))).toEqual(['/nose_point_ar_m.mp3']);
    expect(urls(new ClipResolver(body, ['ar', 'en']).pointQuestion(nose, 'f'))).toEqual(['/nose_point_ar_f.mp3', '/nose_point_en.mp3']);
    expect(new ClipResolver(body, ['en']).pointQuestion(animal('cat', false), 'f')).toEqual([]);
  });

  it('says بَخ! / Peekaboo! from the shared lines, whichever pack is played', () => {
    const lines = { ar: asset('feedback/peekaboo_ar.mp3'), en: asset('feedback/peekaboo_en.mp3') };
    expect(urls(new ClipResolver(body, ['ar', 'en']).peekaboo(lines))).toEqual(['/feedback/peekaboo_ar.mp3', '/feedback/peekaboo_en.mp3']);
    expect(new ClipResolver(body, ['ar']).peekaboo()).toEqual([]);
  });
});
