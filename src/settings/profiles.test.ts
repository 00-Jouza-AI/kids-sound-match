import { beforeEach, describe, expect, it } from 'vitest';
import type { LoadedItem, LoadedPack } from '../content/types';
import {
  FIRST_PROFILE_ID,
  forProfile,
  MAX_PROFILES,
  newProfile,
  profileKey,
  sanitizeProfiles,
  sessionProfile,
} from './profiles';
import { countReplay, replaysLeft } from './replays';
import { defaultSettings, effectiveMode, enabledItemKeys, loadSettings, saveSettings, soundModesAvailable } from './settings';

/** A browser's localStorage, for the code that saves settings. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('child profiles', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    (globalThis as { window?: unknown }).window = { localStorage: storage };
  });

  it('starts with one child, and repairs damaged values', () => {
    expect(sanitizeProfiles(null).profiles.map((p) => p.id)).toEqual([FIRST_PROFILE_ID]);
    const state = sanitizeProfiles({
      profiles: [
        { id: 'a', animal: '🐰', color: '#000' },
        { id: 'a', animal: '🐻', color: '#111' }, // duplicate id
        { id: 3, animal: '🐻' },
        ...Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, animal: '🐱', color: '#222' })),
      ],
      activeId: 'gone',
    });
    expect(state.profiles).toHaveLength(MAX_PROFILES);
    expect(state.profiles[0].id).toBe('a');
    expect(state.activeId).toBe('a');
  });

  it('keeps girl or boy (for Arabic grammar) only when it is one of the two', () => {
    const state = sanitizeProfiles({
      profiles: [
        { id: 'a', animal: '🐰', color: '#000', arGender: 'f' },
        { id: 'b', animal: '🐻', color: '#111', arGender: 'x' },
        { id: 'c', animal: '🐱', color: '#222' },
      ],
      activeId: 'a',
    });
    expect(state.profiles.map((p) => p.arGender)).toEqual(['f', undefined, undefined]);
    expect('arGender' in state.profiles[1]).toBe(false);
  });

  it('gives a new child an animal and colour nobody has yet', () => {
    const first = sanitizeProfiles(null).profiles;
    const second = newProfile(first);
    expect(second.animal).not.toBe(first[0].animal);
    expect(second.color).not.toBe(first[0].color);
    expect(second.id).not.toBe(FIRST_PROFILE_ID);
  });

  it('keeps games saved before profiles with the first child', () => {
    const games = [{ id: 1 }, { id: 2, profileId: 'b' }, { id: 3, profileId: FIRST_PROFILE_ID }];
    expect(forProfile(games, FIRST_PROFILE_ID).map((g) => g.id)).toEqual([1, 3]);
    expect(sessionProfile(games[1])).toBe('b');
  });

  it('keeps settings per child, the first child inheriting the old ones; language is shared', () => {
    // Settings saved before profiles existed.
    storage.setItem('ksm.settings.v1', JSON.stringify({ ...defaultSettings('ar'), choiceCount: 4, uiLanguageOverride: 'en' }));
    expect(loadSettings(FIRST_PROFILE_ID).choiceCount).toBe(4);

    const second = loadSettings('b');
    expect(second.choiceCount).toBe(3); // a new child starts from the defaults
    expect(second.uiLanguageOverride).toBe('en'); // shared
    saveSettings({ ...second, choiceCount: 2, uiLanguageOverride: 'ar' }, 'b');

    expect(loadSettings('b').choiceCount).toBe(2);
    expect(loadSettings(FIRST_PROFILE_ID).choiceCount).toBe(4);
    expect(loadSettings(FIRST_PROFILE_ID).uiLanguageOverride).toBe('ar');
  });

  it('counts play-again per child', () => {
    const now = new Date(2026, 9, 1, 10);
    countReplay(FIRST_PROFILE_ID, now);
    countReplay(FIRST_PROFILE_ID, now);
    expect(replaysLeft(3, FIRST_PROFILE_ID, now)).toBe(1);
    expect(replaysLeft(3, 'b', now)).toBe(3);
    expect(profileKey('ksm.replays.v1', FIRST_PROFILE_ID)).toBe('ksm.replays.v1'); // the first child keeps the old key
  });
});

describe('packs played by name', () => {
  const item = (key: string, sound: boolean): LoadedItem => ({
    key,
    name: { en: key, ar: key },
    images: [],
    placeholderImage: null,
    sound: sound ? { path: key, url: key, real: false } : null,
    nameAudio: { en: { path: '', url: '', real: false }, ar: { path: '', url: '', real: false } },
    confusableWith: [],
  });
  const pack = (id: string, items: LoadedItem[]): LoadedPack => ({
    id,
    version: 1,
    name: { en: id, ar: id },
    kind: 'match',
    order: 1,
    items,
    groups: [],
    feedback: { correct: { en: [], ar: [] }, incorrectTone: null, sessionEnd: { en: null, ar: null } },
  });

  it('plays a pack with fewer than 5 sounds by name, whatever the setting', () => {
    const food = pack('food', ['apple', 'bread', 'milk', 'egg', 'rice'].map((k) => item(k, false)));
    const animals = pack('animals', ['cat', 'dog', 'cow', 'duck', 'frog'].map((k) => item(k, true)));
    expect(effectiveMode(food, 'SOUND_ONLY')).toBe('NAME_ONLY');
    expect(soundModesAvailable(food)).toBe(false);
    expect(effectiveMode(animals, 'SOUND_ONLY')).toBe('SOUND_ONLY');
    // No more "not enough items in this mode" for Food.
    expect(enabledItemKeys(food, defaultSettings('ar'))).toHaveLength(5);
  });
});
