import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/assets/packs/animals/manifest.json';
import { loadContent, type AssetIndex } from './loader';
import { placeholderPathFor } from './paths';
import type { PackManifest } from './types';
import { validatePack } from './validate';

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, 'public', 'assets');
const PLACEHOLDERS = path.join(ROOT, 'dev-assets', 'placeholders');
const manifest = manifestJson as PackManifest;

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

const realFiles = new Set(listFiles(ASSETS));
const placeholderFiles = new Set(listFiles(PLACEHOLDERS));
const existsInDev = (p: string) => realFiles.has(p) || placeholderFiles.has(placeholderPathFor(p) ?? '');

describe('animals manifest (spec 3.4)', () => {
  it('is valid in development (real files + placeholders)', () => {
    const { issues, validKeys } = validatePack(manifest, existsInDev);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(validKeys.size).toBe(54);
  });

  it('has symmetric confusable pairs that name real animals', () => {
    const keys = new Set(manifest.items.map((i) => i.item_key));
    for (const item of manifest.items) {
      for (const other of item.confusable_with ?? []) {
        expect(keys.has(other)).toBe(true);
        expect(manifest.items.find((i) => i.item_key === other)!.confusable_with).toContain(item.item_key);
      }
    }
  });

  it('keeps bear apart from lion and tiger, and uses the singular for goat', () => {
    const bear = manifest.items.find((i) => i.item_key === 'bear')!;
    expect(bear.confusable_with).toEqual(['lion', 'tiger', 'leopard']);
    expect(manifest.items.find((i) => i.item_key === 'goat')!.name.ar).toBe('عنزة');
  });

  it('adds 30 animals: 20 with a sound, 10 quiet ones for name-only play', () => {
    const quiet = manifest.items.filter((i) => !i.sound).map((i) => i.item_key);
    expect(quiet).toEqual(['rabbit', 'giraffe', 'turtle', 'fish', 'butterfly', 'snail', 'ladybug', 'ant', 'kangaroo', 'panda']);
    expect(manifest.items.find((i) => i.item_key === 'leopard')!.confusable_with).toEqual(['lion', 'tiger', 'bear']);
  });

  it('has the 8 real animal sounds', () => {
    for (const key of ['cat', 'dog', 'frog', 'monkey', 'bear', 'sheep', 'tiger', 'duck']) {
      expect(realFiles.has(`packs/animals/${key}_sound.mp3`)).toBe(true);
    }
  });

  it('without placeholders (a release build), items missing real assets are skipped, never crash', () => {
    const { issues, validKeys } = validatePack(manifest, (p) => realFiles.has(p));
    expect(validKeys.size).toBe(0); // no real pictures or name recordings yet
    expect(issues.some((i) => i.message.includes('at least 5'))).toBe(true);
  });
});

describe('validation catches content mistakes', () => {
  const item = (key: string, confusable: string[] = []) => ({
    item_key: key,
    name: { en: key, ar: key },
    image: `p/${key}.webp`,
    sound: `p/${key}.mp3`,
    name_audio: { en: `p/${key}_en.mp3`, ar: `p/${key}_ar.mp3` },
    confusable_with: confusable,
  });
  const pack = (items: ReturnType<typeof item>[]): PackManifest => ({
    pack_id: 'p',
    pack_version: 1,
    schema_version: 1,
    name: { en: 'P', ar: 'P' },
    items,
  });
  const all = () => true;

  it('flags one-sided and unknown confusable pairs', () => {
    const { issues } = validatePack(pack([item('a', ['b']), item('b'), item('c', ['zzz']), item('d'), item('e')]), all);
    const messages = issues.map((i) => i.message).join('\n');
    expect(messages).toMatch(/doesn't list it back/);
    expect(messages).toMatch(/unknown item "zzz"/);
  });

  it('flags packs with fewer than 5 items', () => {
    const { issues } = validatePack(pack([item('a'), item('b'), item('c'), item('d')]), all);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('at least 5'))).toBe(true);
  });

  it('marks an item with a missing file as invalid', () => {
    const { validKeys, issues } = validatePack(
      pack([item('a'), item('b'), item('c'), item('d'), item('e'), item('f')]),
      (p) => p !== 'packs/p/c.mp3',
    );
    expect(validKeys.has('c')).toBe(false);
    expect(validKeys.size).toBe(5);
    expect(issues.find((i) => i.itemKey === 'c')?.message).toMatch(/sound not found/);
  });
});

describe('loader', () => {
  const index: AssetIndex = {
    packs: ['animals'],
    files: [...realFiles],
    placeholders: [...placeholderFiles],
  };
  const fetchJson = async (url: string) => {
    if (url.endsWith('packs/index.json')) return index;
    return JSON.parse(fs.readFileSync(path.join(ASSETS, url.replace(/^\.?\/assets\//, '')), 'utf8'));
  };

  it('prefers real files and falls back to placeholders in development', async () => {
    const content = await loadContent({ baseUrl: '/', allowPlaceholders: true, fetchJson });
    const animals = content.packs[0];
    expect(animals.items).toHaveLength(54);
    const cat = animals.items.find((i) => i.key === 'cat')!;
    expect(cat.sound).toEqual({ path: 'packs/animals/cat_sound.mp3', url: '/assets/packs/animals/cat_sound.mp3', real: true });
    // Real photos replace the emoji, which is kept only as the stand-in for mixed questions.
    expect(cat.images).toHaveLength(15);
    expect(cat.images.every((a) => a.real)).toBe(true);
    expect(cat.images[0].url).toBe('/assets/packs/animals/photos/cat_1.jpg');
    expect(cat.placeholderImage?.url).toBe('/placeholders/packs/animals/photos/cat_1.svg');
    expect(cat.nameAudio.ar.real).toBe(false);
    const cow = animals.items.find((i) => i.key === 'cow')!;
    expect(cow.images.map((a) => a.url)).toEqual(['/placeholders/packs/animals/cow.svg']);
    expect(cow.sound?.url).toBe('/placeholders/packs/animals/cow_sound.wav');
    expect(animals.feedback.incorrectTone?.url).toBe('/placeholders/feedback/incorrect_tone.wav');
    expect(animals.groups.map((g) => g.id)).toEqual(['first', 'farm', 'wild', 'birds', 'sea', 'bugs']);
  });

  it('drops an animal whose placeholder picture the device cannot draw', async () => {
    const content = await loadContent({
      baseUrl: '/',
      allowPlaceholders: true,
      fetchJson,
      placeholderPictureUsable: (key) => key !== 'donkey',
    });
    const keys = content.packs[0].items.map((i) => i.key);
    expect(keys).not.toContain('donkey');
    // The dropped donkey also disappears from the horse's sound-alikes; the zebra stays.
    expect(content.packs[0].items.find((i) => i.key === 'horse')!.confusableWith).toEqual(['zebra']);
  });

  it('never uses placeholders when they are not allowed', async () => {
    const content = await loadContent({ baseUrl: './', allowPlaceholders: false, fetchJson });
    expect(content.packs).toHaveLength(0); // not enough real content yet: the pack is skipped, no crash
    expect(content.issues.length).toBeGreaterThan(0);
  });
});
