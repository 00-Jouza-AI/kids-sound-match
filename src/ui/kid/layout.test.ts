import { describe, expect, it } from 'vitest';
import type { LoadedItem } from '../../content/types';
import { choosePictures, exploreRows, layoutRows } from './layout';

const asset = (url: string, real: boolean) => ({ path: url, url, real });
const item = (key: string, photos: string[]): LoadedItem => ({
  key,
  name: { en: key, ar: key },
  images: photos.length ? photos.map((p) => asset(p, true)) : [asset(`${key}.svg`, false)],
  placeholderImage: asset(`${key}.svg`, false),
  sound: asset(`${key}.mp3`, true),
  nameAudio: { en: asset('', false), ar: asset('', false) },
  confusableWith: [],
});

describe('photos and emoji never share a screen', () => {
  const cat = item('cat', ['cat_1.jpg', 'cat_2.jpg', 'cat_3.jpg']);
  const dog = item('dog', ['dog_1.jpg']);
  const cow = item('cow', []);

  it('shows photos only when every animal on screen has one', () => {
    expect(choosePictures([cat, dog], () => 0)).toEqual({ cat: 'cat_1.jpg', dog: 'dog_1.jpg' });
    expect(choosePictures([cat, cow], () => 0)).toEqual({ cat: 'cat.svg', cow: 'cow.svg' });
  });

  it('picks among several photos of the same animal', () => {
    const seen = new Set(Array.from({ length: 80 }, () => choosePictures([cat, dog]).cat));
    expect(seen).toEqual(new Set(['cat_1.jpg', 'cat_2.jpg', 'cat_3.jpg']));
  });

  it('uses photos in release builds, where there are no placeholders', () => {
    const released = { ...cow, images: [asset('cow.webp', true)], placeholderImage: null };
    expect(choosePictures([cat, released], () => 0)).toEqual({ cat: 'cat_1.jpg', cow: 'cow.webp' });
  });
});

describe('layouts', () => {
  it('stacks 2 pictures upright and puts them side by side sideways', () => {
    expect(layoutRows(2, 'portrait')).toEqual([[0], [1]]);
    expect(layoutRows(2, 'landscape')).toEqual([[0, 1]]);
    expect(layoutRows(3, 'portrait')).toEqual([[0, 1], [2]]);
    expect(layoutRows(4, 'landscape')).toEqual([[0, 1], [2, 3]]);
  });

  it('lays out 5 to 10 pictures 2 across upright and in two rows sideways', () => {
    expect(layoutRows(5, 'portrait')).toEqual([[0, 1], [2, 3], [4]]);
    expect(layoutRows(10, 'portrait')).toHaveLength(5);
    expect(layoutRows(7, 'landscape')).toEqual([[0, 1, 2, 3], [4, 5, 6]]);
    expect(layoutRows(10, 'landscape')).toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
    for (const n of [5, 6, 7, 8, 10]) {
      for (const o of ['portrait', 'landscape'] as const) expect(layoutRows(n, o).flat()).toEqual([...Array(n).keys()]);
    }
  });

  it('lays out Explore 2 across upright and 3 across sideways', () => {
    expect(exploreRows(6, 'portrait')).toEqual([[0, 1], [2, 3], [4, 5]]);
    expect(exploreRows(5, 'landscape')).toEqual([[0, 1, 2], [3, 4]]);
  });
});
