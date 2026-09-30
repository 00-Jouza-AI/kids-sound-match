import { describe, expect, it } from 'vitest';
import type { PackManifest } from './types';
import { validatePack } from './validate';

// Packs for things without a sound (clothes, food, family) are played in "name only" mode.
const clothing = (key: string, sound?: string) => ({
  item_key: key,
  name: { en: key, ar: key },
  image: `clothes/${key}.webp`,
  ...(sound ? { sound } : {}),
  name_audio: { en: `clothes/${key}_en.mp3`, ar: `clothes/${key}_ar.mp3` },
});

const pack = (items: ReturnType<typeof clothing>[]): PackManifest => ({
  pack_id: 'clothes',
  pack_version: 1,
  schema_version: 1,
  name: { en: 'Clothes', ar: 'الملابس' },
  items,
});

describe('packs without sounds', () => {
  it('accepts items with no sound', () => {
    const { issues, validKeys } = validatePack(pack(['shirt', 'shoe', 'hat', 'sock', 'dress'].map((k) => clothing(k))), () => true);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(validKeys.size).toBe(5);
  });

  it('still rejects a sound file that is named but missing', () => {
    const items = ['shirt', 'shoe', 'hat', 'sock'].map((k) => clothing(k));
    const { validKeys, issues } = validatePack(pack([...items, clothing('dress', 'clothes/dress_sound.mp3')]), (p) => !p.endsWith('dress_sound.mp3'));
    expect(validKeys.has('dress')).toBe(false);
    expect(issues.find((i) => i.itemKey === 'dress')?.message).toMatch(/sound not found/);
  });
});
