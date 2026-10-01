import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/assets/packs/animals/manifest.json';
import { defaultSettings, enabledItemKeys } from '../settings/settings';
import { loadContent, type AssetIndex } from './loader';
import { buildMixedPack, mixedGroups, sourcePacks } from './mixed';
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

describe('all packs', () => {
  const packIds = fs.readdirSync(path.join(ASSETS, 'packs')).filter((d) => fs.existsSync(path.join(ASSETS, 'packs', d, 'manifest.json')));
  const read = (id: string) => JSON.parse(fs.readFileSync(path.join(ASSETS, 'packs', id, 'manifest.json'), 'utf8')) as PackManifest;
  const index: AssetIndex = { packs: packIds, files: [...realFiles], placeholders: [...placeholderFiles] };
  const fetchAll = async (url: string) => {
    if (url.endsWith('packs/index.json')) return index;
    return JSON.parse(fs.readFileSync(path.join(ASSETS, url.replace(/^\.?\/assets\//, '')), 'utf8'));
  };
  const load = (usable?: (key: string) => boolean) =>
    loadContent({ baseUrl: '/', allowPlaceholders: true, fetchJson: fetchAll, placeholderPictureUsable: usable });

  it('are all valid in development', () => {
    for (const id of packIds) {
      const { issues } = validatePack(read(id), existsInDev);
      expect(issues.filter((i) => i.level === 'error'), id).toEqual([]);
    }
  });

  it('never reuse an item key between packs (so the Report and the Mixed game can tell them apart)', () => {
    const owner = new Map<string, string>();
    for (const id of packIds) {
      const m = read(id);
      if (m.kind === 'association') continue; // its answers reuse Food's and Animals' files on purpose
      for (const item of m.items) {
        expect(owner.get(item.item_key), `${item.item_key} in ${id}`).toBeUndefined();
        owner.set(item.item_key, id);
      }
    }
  });

  it('load in order, and link every food to the animals that eat it', async () => {
    const content = await load();
    expect(content.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(content.packs.map((p) => p.id)).toEqual([
      'animals', 'home', 'vehicles', 'instruments', 'food', 'body', 'family',
      'colors', 'shapes', 'feelings', 'counting', 'who-eats-what', 'where-lives',
    ]);
    const whoEats = content.packs.find((p) => p.id === 'who-eats-what')!;
    expect(whoEats.kind).toBe('association');
    expect(whoEats.items).toHaveLength(15);
    const carrot = whoEats.items.find((i) => i.key === 'carrot')!;
    expect(carrot.prompts!.map((p) => p.key)).toEqual(['rabbit', 'donkey', 'horse']);
    expect(carrot.nameAudio.ar.path).toBe('packs/food/carrot_name_ar.mp3'); // the same recording as in Food
    expect(whoEats.association!.question.ar?.url).toBe('/placeholders/feedback/eat_question_ar.wav');
    expect(whoEats.association!.reward?.url).toBe('/placeholders/feedback/yum.wav');
    const animals = content.packs[0];
    const gender = (key: string) => animals.items.find((i) => i.key === key)!.arFeminine;
    expect([gender('cow'), gender('horse'), gender('turtle'), gender('snake')]).toEqual([true, false, true, true]);
  });

  it('leave out a food when none of its animals can be shown', async () => {
    const content = await load((key) => !['rabbit', 'donkey', 'horse'].includes(key));
    const whoEats = content.packs.find((p) => p.id === 'who-eats-what')!;
    expect(whoEats.items.find((i) => i.key === 'carrot')).toBeUndefined();
    expect(whoEats.items.find((i) => i.key === 'apple')).toBeUndefined();
    expect(whoEats.items.find((i) => i.key === 'lettuce')!.prompts!.map((p) => p.key)).toEqual(['turtle', 'snail']);
  });

  it('make a Mixed game from every ready "match" pack, with each pack\'s own choice', async () => {
    const content = await load();
    const mixed = buildMixedPack(content.packs, content.packs[0].feedback)!;
    // Counting stays out of the mix.
    expect(mixed.parts!.map((p) => p.id)).toEqual(['animals', 'home', 'vehicles', 'instruments', 'food', 'body', 'family', 'colors', 'shapes', 'feelings']);
    expect(new Set(mixed.items.map((i) => i.key)).size).toBe(mixed.items.length);
    expect(mixed.items.find((i) => i.key === 'bell')!.confusableWith).toContain('doorbell');

    const settings = defaultSettings('ar');
    // Sound modes: the 8 animals with real sounds, plus every home, vehicle, instrument and feeling sound.
    expect(enabledItemKeys(mixed, settings)).toHaveLength(8 + 15 + 14 + 11 + 6);
    settings.mode = 'NAME_ONLY';
    expect(enabledItemKeys(mixed, settings)).toHaveLength(8 + 15 + 14 + 11 + 25 + 13 + 9 + 6 + 6 + 6);
    settings.mixedExcluded = ['animals', 'home', 'vehicles', 'instruments', 'body', 'family', 'colors', 'shapes', 'feelings'];
    expect(enabledItemKeys(mixed, settings)).toEqual(content.packs.find((p) => p.id === 'food')!.items.map((i) => i.key));
    expect(sourcePacks(mixed).get('drum')).toBe('instruments');
    // Colours, shapes and feelings only appear with their own kind; the other built-in packs mix.
    const groups = mixedGroups(mixed);
    expect([groups.get('cat'), groups.get('drum'), groups.get('color_red'), groups.get('happy')]).toEqual([
      'builtin', 'builtin', 'pack:colors', 'pack:feelings',
    ]);
  });

  it('link every home to the animals that live there, shown at home when found', async () => {
    const content = await load();
    const homes = content.packs.find((p) => p.id === 'where-lives')!;
    expect(homes.kind).toBe('association');
    expect(homes.association!.celebration).toBe('home');
    expect(homes.items.map((i) => i.key)).toEqual(['farm', 'house', 'sea', 'river', 'jungle', 'desert', 'snow', 'nest', 'hive']);
    expect(homes.items.find((i) => i.key === 'hive')!.prompts!.map((p) => p.key)).toEqual(['bee']);
    expect(content.packs.find((p) => p.id === 'who-eats-what')!.association!.celebration).toBe('eat');
  });

  it('draw colours, shapes and counting as final pictures, so they need no artist', async () => {
    const content = await load();
    for (const id of ['colors', 'shapes', 'counting']) {
      const pack = content.packs.find((p) => p.id === id)!;
      expect(pack.items.every((i) => i.images.every((a) => a.real)), id).toBe(true);
    }
    const three = content.packs.find((p) => p.id === 'counting')!.items.find((i) => i.key === 'count_3')!;
    expect(three.images.map((a) => a.path.split('_').pop())).toEqual(['dots.svg', 'apples.svg', 'stars.svg', 'balloons.svg', 'fish.svg']);
  });

  it('use a recording saved in another format than the manifest says (the studio saves WAV)', async () => {
    const withWav = { ...index, files: [...index.files, 'packs/animals/cow_name_ar.wav'] };
    const content = await loadContent({
      baseUrl: '/',
      allowPlaceholders: true,
      fetchJson: async (url) => (url.endsWith('packs/index.json') ? withWav : fetchAll(url)),
    });
    const cow = content.packs[0].items.find((i) => i.key === 'cow')!;
    expect(cow.nameAudio.ar).toEqual({ path: 'packs/animals/cow_name_ar.mp3', url: '/assets/packs/animals/cow_name_ar.wav', real: true });
  });
});
