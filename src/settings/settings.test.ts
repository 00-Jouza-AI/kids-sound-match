import { describe, expect, it } from 'vitest';
import type { LoadedItem, LoadedPack } from '../content/types';
import {
  defaultSelection,
  defaultSettings,
  deviceLanguage,
  enabledItemKeys,
  sanitizeSettings,
  spokenLanguages,
  usableInMode,
} from './settings';

describe('settings', () => {
  it('follows the device language and falls back to Arabic', () => {
    expect(deviceLanguage(['en-GB', 'ar'])).toBe('en');
    expect(deviceLanguage(['ar-JO'])).toBe('ar');
    expect(deviceLanguage(['fr-FR', 'de'])).toBe('ar');
    expect(deviceLanguage([])).toBe('ar');
  });

  it('uses the spec defaults', () => {
    const d = defaultSettings('ar');
    expect(d).toMatchObject({
      mode: 'SOUND_AND_NAME',
      choiceCount: 3,
      repeatIntervalSec: 2,
      questionsPerSession: 10,
      toddlerMode: false,
      telemetryEnabled: false,
      uiLanguageOverride: 'system',
    });
  });

  it('turns hints and adaptive practice on by default, and speaks Arabic first for Both', () => {
    expect(defaultSettings('en')).toMatchObject({ hints: true, adaptive: true });
    expect(spokenLanguages('both')).toEqual(['ar', 'en']);
    expect(spokenLanguages('en')).toEqual(['en']);
    expect(sanitizeSettings({ mode: 'NAME_ONLY', language: 'both', hints: false }, 'ar')).toMatchObject({
      mode: 'NAME_ONLY',
      language: 'both',
      hints: false,
      adaptive: true,
    });
  });

  it('repairs damaged or old stored values field by field', () => {
    const s = sanitizeSettings(
      { choiceCount: 9, mode: 'SOUND_ONLY', language: 'fr', toddlerMode: 'yes', enabledItems: { animals: ['cat', 3] } },
      'en',
    );
    expect(s.choiceCount).toBe(3);
    expect(s.mode).toBe('SOUND_ONLY');
    expect(s.language).toBe('en');
    expect(s.toddlerMode).toBe(false);
    expect(s.enabledItems).toEqual({ animals: ['cat'] });
    expect(sanitizeSettings('garbage', 'ar')).toEqual(defaultSettings('ar'));
  });
});

describe('animal selection', () => {
  const item = (key: string, realSound: boolean): LoadedItem => ({
    key,
    name: { en: key, ar: key },
    images: [],
    placeholderImage: null,
    sound: { path: key, url: key, real: realSound },
    nameAudio: { en: { path: '', url: '', real: false }, ar: { path: '', url: '', real: false } },
    confusableWith: [],
  });
  const pack = (items: LoadedItem[]): LoadedPack => ({
    id: 'animals',
    version: 1,
    name: { en: 'Animals', ar: 'Animals' },
    kind: 'match',
    order: 1,
    items,
    groups: [],
    feedback: { correct: { en: [], ar: [] }, incorrectTone: null, sessionEnd: { en: null, ar: null } },
  });
  const eightReal = pack([
    ...['cat', 'dog', 'frog', 'monkey', 'bear', 'sheep', 'tiger', 'duck'].map((k) => item(k, true)),
    ...['cow', 'goat'].map((k) => item(k, false)),
  ]);

  it('defaults to the animals that have a real sound', () => {
    expect(defaultSelection(eightReal)).toEqual(['cat', 'dog', 'frog', 'monkey', 'bear', 'sheep', 'tiger', 'duck']);
  });

  it('uses every animal when fewer than 5 have a real sound', () => {
    const few = pack(['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => item(k, i < 2)));
    expect(defaultSelection(few)).toHaveLength(6);
  });

  it('leaves out things without a sound unless the mode is "name only"', () => {
    const clothes = pack(['shirt', 'shoe', 'hat', 'sock', 'dress'].map((k) => ({ ...item(k, false), sound: null })));
    const withAnimals = pack([...eightReal.items, ...clothes.items]);
    const settings = defaultSettings('ar');
    expect(enabledItemKeys(withAnimals, settings)).toEqual(['cat', 'dog', 'frog', 'monkey', 'bear', 'sheep', 'tiger', 'duck']);
    settings.mode = 'NAME_ONLY';
    settings.enabledItems = { animals: ['shirt', 'shoe', 'hat', 'sock', 'dress'] };
    expect(enabledItemKeys(withAnimals, settings)).toEqual(['shirt', 'shoe', 'hat', 'sock', 'dress']);
    expect(defaultSelection(clothes, 'NAME_ONLY')).toHaveLength(5);
  });

  it("honours the parent's choice, but never drops below 5 animals", () => {
    const settings = defaultSettings('ar');
    settings.enabledItems = { animals: ['cat', 'dog', 'cow', 'goat', 'bear'] };
    expect(enabledItemKeys(eightReal, settings)).toEqual(['cat', 'dog', 'bear', 'cow', 'goat']);
    settings.enabledItems = { animals: ['cat', 'dog'] };
    expect(enabledItemKeys(eightReal, settings)).toHaveLength(8);
  });

  it('always lets "Who eats what?" foods play, whatever the mode: the question is the animal', () => {
    const carrot: LoadedItem = { ...item('carrot', false), sound: null, prompts: [item('rabbit', true)] };
    for (const mode of ['SOUND_AND_NAME', 'SOUND_ONLY', 'NAME_ONLY'] as const) expect(usableInMode(carrot, mode)).toBe(true);
    expect(usableInMode({ ...carrot, prompts: undefined }, 'SOUND_ONLY')).toBe(false);
  });

  it('repairs a damaged Mixed-game list', () => {
    expect(sanitizeSettings({ mixedExcluded: ['food', 3, null] }, 'ar').mixedExcluded).toEqual(['food']);
    expect(sanitizeSettings({ mixedExcluded: 'food' }, 'ar').mixedExcluded).toEqual([]);
  });
});
