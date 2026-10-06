import { describe, expect, it } from 'vitest';
import type { LoadedItem, LoadedPack } from '../content/types';
import { activeGroup, groupPlayable, pickPatch } from './quickPick';
import { defaultSettings, sanitizeSettings } from './settings';

const item = (key: string): LoadedItem => ({
  key,
  name: { en: key, ar: key },
  images: [],
  placeholderImage: null,
  sound: { path: key, url: key, real: true },
  nameAudio: { ar: { path: '', url: '', real: true }, en: { path: '', url: '', real: true } },
  confusableWith: [],
});
const keys = ['cow', 'sheep', 'goat', 'horse', 'hen', 'duck', 'lion', 'tiger', 'bear', 'monkey', 'zebra'];
const animals: LoadedPack = {
  id: 'animals',
  version: 1,
  name: { en: 'Animals', ar: 'الحيوانات' },
  kind: 'match',
  order: 1,
  items: keys.map(item),
  groups: [
    { id: 'farm', name: { en: 'Farm', ar: 'المزرعة' }, items: ['cow', 'sheep', 'goat', 'horse', 'hen', 'duck'] },
    { id: 'wild', name: { en: 'Wild', ar: 'البرية' }, items: ['lion', 'tiger', 'bear', 'monkey', 'zebra'] },
    { id: 'tiny', name: { en: 'Tiny', ar: 'صغيرة' }, items: ['hen', 'duck'] },
  ],
  feedback: { correct: { ar: [], en: [] }, incorrectTone: null, sessionEnd: { ar: null, en: null } },
};

describe('the quick picker on the end screen', () => {
  it('shows what the pack is playing: all of it, a group, or a hand-picked mix', () => {
    const s = defaultSettings('ar');
    expect(activeGroup(animals, s)).toBe('all');
    expect(activeGroup(animals, { ...s, enabledItems: { animals: ['lion', 'tiger', 'bear', 'monkey', 'zebra'] } })).toBe('wild');
    expect(activeGroup(animals, { ...s, enabledItems: { animals: ['cow', 'lion', 'hen', 'duck', 'bear'] } })).toBeNull();
  });

  it('plays a group, all of the pack, or keeps the pictures chosen in Settings', () => {
    const s = { ...defaultSettings('ar'), packId: 'food', enabledItems: { animals: ['cow', 'lion', 'hen', 'duck', 'bear'], food: ['apple'] } };
    expect(pickPatch(s, animals, 'farm')).toEqual({ packId: 'animals', enabledItems: { animals: ['cow', 'sheep', 'goat', 'horse', 'hen', 'duck'], food: ['apple'] } });
    expect(pickPatch(s, animals, 'all')).toEqual({ packId: 'animals', enabledItems: { food: ['apple'] } });
    expect(pickPatch(s, animals, null)).toEqual({ packId: 'animals' });
  });

  it('offers only groups with at least 5 pictures', () => {
    const s = defaultSettings('ar');
    expect(groupPlayable(animals, animals.groups[0].items, s)).toBe(true);
    expect(groupPlayable(animals, animals.groups[2].items, s)).toBe(false);
  });
});

describe('new settings', () => {
  it('accepts 2 to 8 or 10 pictures, and shows the names on the pictures unless turned off', () => {
    expect(sanitizeSettings({ choiceCount: 10 }, 'ar').choiceCount).toBe(10);
    expect(sanitizeSettings({ choiceCount: 9 }, 'ar').choiceCount).toBe(3);
    expect(sanitizeSettings({}, 'ar').cardNames).toBe(true);
    expect(sanitizeSettings({ cardNames: false }, 'ar').cardNames).toBe(false);
  });
});
