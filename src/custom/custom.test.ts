import { describe, expect, it } from 'vitest';
import type { LoadedFeedback } from '../content/types';
import { encodeWav, resample, suggestTrim, trimSamples, waveformPeaks } from './audioTools';
import { centredSquare, clampCrop } from './imageTools';
import { customOps } from './ops';
import { MemoryCustomStore } from './store';
import { forgetCloud, planSync, runSync, type Remote, type RemoteItem, type RemotePack } from './sync';
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
  media = new Map<string, Blob>();
  async listPacks() {
    return [...this.packs.values()];
  }
  async listItems() {
    return [...this.items.values()];
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
    this.media.clear();
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
});
