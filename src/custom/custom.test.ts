import { describe, expect, it } from 'vitest';
import type { LoadedFeedback, LoadedItem, LoadedPack, ResolvedAsset } from '../content/types';
import { encodeWav, resample, suggestTrim, trimSamples, waveformPeaks } from './audioTools';
import { centredSquare, clampCrop } from './imageTools';
import { customOps } from './ops';
import { applyOverrides, overrideMap, overrideOps } from './overrides';
import { MemoryCustomStore } from './store';
import { forgetCloud, planSync, runSync, type Remote, type RemoteItem, type RemoteOverride, type RemotePack } from './sync';
import { customToLoaded } from './toLoaded';
import type { MediaName } from './types';

const RATE = 22050;
const tone = (seconds: number, amp: number) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / RATE));
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('recording tools', () => {
  it('writes a valid 16-bit mono WAV', async () => {
    const blob = encodeWav(tone(0.5, 0.5), RATE);
    const bytes = new DataView(await blob.arrayBuffer());
    const text = (o: number) => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => bytes.getUint8(o + i)));
    expect(blob.type).toBe('audio/wav');
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(bytes.getUint32(24, true)).toBe(RATE);
    expect(bytes.getUint32(40, true)).toBe(Math.round(0.5 * RATE) * 2);
  });

  it('cuts to the chosen times, fading the edges so they do not click', () => {
    const audio = { samples: tone(2, 0.8), sampleRate: RATE };
    const cut = trimSamples(audio, 0.5, 1.25);
    expect(cut.length).toBe(Math.round(0.75 * RATE));
    expect(Math.abs(cut[0])).toBe(0);
    expect(Math.abs(cut[cut.length - 1])).toBe(0);
  });

  it('suggests a cut around the sound, leaving the silence out', () => {
    const audio = { samples: join(new Float32Array(RATE), tone(0.6, 0.4), new Float32Array(RATE)), sampleRate: RATE };
    const { start, end } = suggestTrim(audio);
    expect(start).toBeCloseTo(0.95, 2);
    expect(end).toBeCloseTo(1.7, 2);
  });

  it('resamples to the storage rate and draws a waveform', () => {
    expect(resample(tone(1, 0.5), 48000, RATE).length).toBe(Math.round(RATE * (RATE / 48000)));
    expect(resample(new Float32Array(48000), 48000, RATE).length).toBe(RATE);
    const peaks = waveformPeaks(join(new Float32Array(RATE), tone(1, 0.5)), 10);
    expect(peaks.slice(0, 5).every((p) => p === 0)).toBe(true);
    expect(peaks[7]).toBeCloseTo(0.5, 2);
  });
});

describe('picture cropping', () => {
  it('starts with the largest centred square and never leaves the photo', () => {
    expect(centredSquare(3000, 4000)).toEqual({ x: 0, y: 500, size: 3000 });
    expect(clampCrop({ x: -50, y: 3900, size: 1000 }, 3000, 4000)).toEqual({ x: 0, y: 3000, size: 1000 });
    expect(clampCrop({ x: 10, y: 10, size: 5000 }, 3000, 4000)).toEqual({ x: 0, y: 10, size: 3000 });
  });
});

const feedback: LoadedFeedback = { correct: { en: [], ar: [] }, incorrectTone: null, sessionEnd: { en: null, ar: null } };
const blob = (label: string) => new Blob([label], { type: 'application/octet-stream' });

describe('custom packs in the game', () => {
  it('plays only finished items, and reuses a single recording for both languages', async () => {
    const store = new MemoryCustomStore();
    const ops = customOps(store);
    const pack = await ops.createPack({ en: 'Family', ar: 'العائلة' });
    const mama = { ...ops.emptyItem(pack.id), name: { en: '', ar: 'ماما' }, picture: blob('p'), nameAudio: { ar: blob('a') } };
    const unfinished = { ...ops.emptyItem(pack.id), name: { en: 'Baba', ar: '' }, picture: blob('p2') };
    await ops.saveItem(mama, true);
    await ops.saveItem(unfinished, true);
    const [view] = customToLoaded(await store.packs(), await store.items(), feedback, (b) => `blob:${b.size}`);
    expect(view.loaded.id).toBe(`custom:${pack.id}`);
    expect(view.items).toHaveLength(2);
    expect(view.loaded.items).toHaveLength(1);
    const item = view.loaded.items[0];
    expect(item.name).toEqual({ ar: 'ماما', en: 'ماما' });
    expect(item.nameAudio.en.url).toBe(item.nameAudio.ar.url);
    expect(item.sound).toBeNull();
  });

  it('hides deleted packs and items', async () => {
    const store = new MemoryCustomStore();
    const ops = customOps(store);
    const keep = await ops.createPack({ en: 'Toys', ar: 'ألعاب' });
    const gone = await ops.createPack({ en: 'Old', ar: 'قديم' });
    const car = { ...ops.emptyItem(keep.id), picture: blob('c'), nameAudio: { en: blob('e') } };
    await ops.saveItem(car, true);
    await ops.deletePack(gone);
    await ops.deleteItem((await store.items())[0]);
    const views = customToLoaded(await store.packs(), await store.items(), feedback, () => 'blob:x');
    expect(views.map((v) => v.pack.id)).toEqual([keep.id]);
    expect(views[0].items).toHaveLength(0);
    expect((await store.items())[0]).toMatchObject({ deleted: true, picture: null, sound: null });
  });
});

class FakeRemote implements Remote {
  packs = new Map<string, RemotePack>();
  items = new Map<string, RemoteItem>();
  overrides = new Map<string, RemoteOverride>();
  media = new Map<string, Blob>();
  overrideFiles = new Map<string, Blob>();
  async listPacks() {
    return [...this.packs.values()];
  }
  async listItems() {
    return [...this.items.values()];
  }
  /** False: a cloud set up before "Your voice and photos". */
  voiceTable = true;
  async listOverrides() {
    return this.voiceTable ? [...this.overrides.values()] : null;
  }
  async upsertOverride(o: RemoteOverride) {
    this.overrides.set(o.path, o);
  }
  async uploadOverride(path: string, b: Blob) {
    this.overrideFiles.set(path, b);
  }
  async downloadOverride(path: string) {
    const b = this.overrideFiles.get(path);
    if (!b) throw new Error(`missing ${path}`);
    return b;
  }
  async removeOverride(path: string) {
    this.overrideFiles.delete(path);
  }
  async upsertPack(p: RemotePack) {
    this.packs.set(p.id, p);
  }
  async upsertItem(i: RemoteItem) {
    this.items.set(i.id, i);
  }
  async uploadMedia(id: string, name: MediaName, b: Blob) {
    this.media.set(`${id}/${name}`, b);
  }
  async downloadMedia(id: string, name: MediaName) {
    const b = this.media.get(`${id}/${name}`);
    if (!b) throw new Error(`missing ${id}/${name}`);
    return b;
  }
  async removeMedia(id: string, names: MediaName[]) {
    for (const n of names) this.media.delete(`${id}/${n}`);
  }
  async deleteEverything() {
    this.packs.clear();
    this.items.clear();
    this.overrides.clear();
    this.media.clear();
    this.overrideFiles.clear();
  }
}

describe('cloud sync', () => {
  it('backs a phone up, and restores it on a second phone', async () => {
    let clock = 1000;
    const phoneA = new MemoryCustomStore();
    const opsA = customOps(phoneA, () => ++clock);
    const cloud = new FakeRemote();
    const pack = await opsA.createPack({ en: 'Family', ar: 'العائلة' });
    await opsA.saveItem({ ...opsA.emptyItem(pack.id), name: { en: 'Mama', ar: 'ماما' }, picture: blob('pic'), nameAudio: { ar: blob('ar') }, sound: blob('snd') }, true);

    expect(await runSync(phoneA, cloud, 'user-1')).toEqual({ pushed: 2, pulled: 0 });
    expect([...cloud.media.keys()].map((k) => k.split('/')[1]).sort()).toEqual(['name_ar', 'picture', 'sound']);
    expect(await runSync(phoneA, cloud, 'user-1')).toEqual({ pushed: 0, pulled: 0 }); // nothing left to do

    const phoneB = new MemoryCustomStore();
    expect(await runSync(phoneB, cloud, 'user-1')).toEqual({ pushed: 0, pulled: 2 });
    const [item] = await phoneB.items();
    expect(item.name).toEqual({ en: 'Mama', ar: 'ماما' });
    expect(await item.picture!.text()).toBe('pic');
    expect(item.nameAudio.en).toBeUndefined();
    expect(await item.sound!.text()).toBe('snd');
  });

  it('newest change wins, and deletions reach the other phone', async () => {
    let clock = 1000;
    const tick = () => ++clock;
    const cloud = new FakeRemote();
    const phoneA = new MemoryCustomStore();
    const phoneB = new MemoryCustomStore();
    const opsA = customOps(phoneA, tick);
    const opsB = customOps(phoneB, tick);
    const pack = await opsA.createPack({ en: 'Toys', ar: 'ألعاب' });
    await runSync(phoneA, cloud, 'u');
    await runSync(phoneB, cloud, 'u');

    await opsA.renamePack((await phoneA.packs())[0], { en: 'My toys', ar: 'ألعابي' });
    await opsB.renamePack((await phoneB.packs())[0], { en: 'Toys!', ar: 'ألعاب!' }); // later: wins
    await runSync(phoneA, cloud, 'u');
    await runSync(phoneB, cloud, 'u');
    await runSync(phoneA, cloud, 'u');
    expect((await phoneA.packs())[0].name.en).toBe('Toys!');

    await opsB.deletePack((await phoneB.packs())[0]);
    await runSync(phoneB, cloud, 'u');
    await runSync(phoneA, cloud, 'u');
    expect((await phoneA.packs()).find((p) => p.id === pack.id)?.deleted).toBe(true);
  });

  it("never uploads one parent's items into another parent's account", async () => {
    const phone = new MemoryCustomStore();
    const ops = customOps(phone);
    const cloudA = new FakeRemote();
    const cloudB = new FakeRemote();
    await ops.createPack({ en: 'A', ar: 'A' });
    await runSync(phone, cloudA, 'parent-a');
    expect(await runSync(phone, cloudB, 'parent-b')).toEqual({ pushed: 0, pulled: 0 });
    expect(cloudB.packs.size).toBe(0);
    expect(planSync({ packs: await phone.packs(), items: [] }, { packs: [], items: [] }, 'parent-b').pushPacks).toEqual([]);
  });

  it('keeps everything on the phone after "Delete my cloud data"', async () => {
    const phone = new MemoryCustomStore();
    await customOps(phone).createPack({ en: 'A', ar: 'A' });
    await runSync(phone, new FakeRemote(), 'u');
    await forgetCloud(phone);
    const [pack] = await phone.packs();
    expect(pack.ownerId).toBeUndefined();
    expect(pack.syncedAt).toBeUndefined();
  });

  it("backs up the parent's voice and photos, and removals reach the other phone", async () => {
    let clock = 1000;
    const tick = () => ++clock;
    const cloud = new FakeRemote();
    const phoneA = new MemoryCustomStore();
    const phoneB = new MemoryCustomStore();
    const voiceA = overrideOps(phoneA, tick);
    await voiceA.save('packs/family/mama_name_ar.mp3', blob('mama'));
    await voiceA.save('packs/family/mama.webp', blob('photo'));

    expect(await runSync(phoneA, cloud, 'u')).toEqual({ pushed: 2, pulled: 0 });
    expect(await runSync(phoneB, cloud, 'u')).toEqual({ pushed: 0, pulled: 2 });
    const onB = overrideMap(await phoneB.overrides());
    expect(await onB.get('packs/family/mama_name_ar.mp3')!.text()).toBe('mama');

    await voiceA.remove('packs/family/mama.webp');
    await runSync(phoneA, cloud, 'u');
    expect(cloud.overrideFiles.has('packs/family/mama.webp')).toBe(false);
    await runSync(phoneB, cloud, 'u');
    expect([...overrideMap(await phoneB.overrides()).keys()]).toEqual(['packs/family/mama_name_ar.mp3']);
  });

  it('still backs up the packs when the cloud was set up before "Your voice and photos"', async () => {
    const phone = new MemoryCustomStore();
    const cloud = new FakeRemote();
    cloud.voiceTable = false;
    await customOps(phone).createPack({ en: 'A', ar: 'A' });
    await overrideOps(phone).save('packs/family/mama_name_ar.mp3', blob('mama'));
    expect(await runSync(phone, cloud, 'u')).toEqual({ pushed: 1, pulled: 0 });
    expect(cloud.packs.size).toBe(1);
    // The recording waits on the phone until schema.sql has been run again.
    expect((await phone.overrides())[0].syncedAt).toBeUndefined();
  });
});

describe('your voice and photos', () => {
  const asset = (path: string): ResolvedAsset => ({ path, url: `placeholder:${path}`, real: false });
  const loaded = (key: string, folder: string, extra: Partial<LoadedItem> = {}): LoadedItem => ({
    key,
    name: { en: key, ar: key },
    images: [asset(`packs/${folder}/${key}.webp`)],
    placeholderImage: asset(`packs/${folder}/${key}.webp`),
    sound: null,
    nameAudio: { ar: asset(`packs/${folder}/${key}_name_ar.mp3`), en: asset(`packs/${folder}/${key}_name_en.mp3`) },
    confusableWith: [],
    picturePath: `packs/${folder}/${key}.webp`,
    ...extra,
  });
  const packOf = (id: string, items: LoadedItem[], extra: Partial<LoadedPack> = {}): LoadedPack => ({
    id,
    version: 1,
    name: { en: id, ar: id },
    kind: 'match',
    order: 1,
    items,
    groups: [],
    feedback: { correct: { ar: [asset('feedback/correct_ar_1.mp3')], en: [] }, incorrectTone: null, sessionEnd: { ar: null, en: null } },
    ...extra,
  });

  it('swaps in the recordings and photos, everywhere a file is used', () => {
    const rabbit = loaded('rabbit', 'animals');
    const food = packOf('food', [loaded('carrot', 'food')]);
    const whoEats = packOf('who-eats-what', [loaded('carrot', 'food', { prompts: [rabbit] })], {
      kind: 'association',
      association: {
        promptPackId: 'animals',
        question: { ar: asset('feedback/eat_question_ar.mp3'), en: null },
        questionFeminine: { ar: null, en: null },
        reward: null,
      },
    });
    const mine = new Map([
      ['packs/food/carrot_name_ar.mp3', blob('jazara')],
      ['packs/food/carrot.webp', blob('our carrot')],
      ['packs/animals/rabbit_name_ar.mp3', blob('arnab')],
      ['feedback/correct_ar_1.mp3', blob('jameel')],
      ['feedback/eat_question_ar.mp3', blob('question')],
    ]);
    const [f, w] = applyOverrides([food, whoEats], mine, (b) => `blob:${b.size}`);
    for (const carrot of [f.items[0], w.items[0]]) {
      expect(carrot.nameAudio.ar).toEqual({ path: 'packs/food/carrot_name_ar.mp3', url: 'blob:6', real: true });
      expect(carrot.nameAudio.en.real).toBe(false); // not recorded: the original stays
      expect(carrot.images).toEqual([{ path: 'packs/food/carrot.webp', url: 'blob:10', real: true, photo: true }]);
    }
    expect(w.items[0].prompts![0].nameAudio.ar.real).toBe(true);
    expect(f.feedback.correct.ar[0].real).toBe(true);
    expect(w.association!.question.ar!.real).toBe(true);
  });

  it('keeps a removed recording as a marker, and forgets it in the map', async () => {
    const store = new MemoryCustomStore();
    const voice = overrideOps(store, () => 5);
    await voice.save('packs/animals/cat_name_ar.mp3', blob('a'));
    await voice.save('packs/animals/cat_name_ar.mp3', blob('b'));
    await voice.remove('packs/animals/cat_name_ar.mp3');
    const [record] = await store.overrides();
    expect(record).toMatchObject({ deleted: true, blob: null, mediaVersion: 3 });
    expect(overrideMap(await store.overrides()).size).toBe(0);
  });
});
