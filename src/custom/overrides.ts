import type { LoadedAssociation, LoadedFeedback, LoadedItem, LoadedPack, PointLine, PointVoice, ResolvedAsset } from '../content/types';
import type { CustomStore } from './store';
import { blobUrl } from './toLoaded';
import type { AssetOverride } from './types';

/** The parent's current recordings and photos, by the path of the built-in file each one replaces. */
export function overrideMap(list: readonly AssetOverride[]): Map<string, Blob> {
  return new Map(list.filter((o) => !o.deleted && o.blob).map((o) => [o.path, o.blob!]));
}

/**
 * The built-in packs with the parent's own voice and photos swapped in: names, sounds, praise and
 * the "Who eats what?" lines. A photo replaces all of that item's pictures. Files shared by two
 * packs (the carrot in Food and in Who eats what?) are recorded once and change in both.
 */
export function applyOverrides(
  packs: readonly LoadedPack[],
  overrides: ReadonlyMap<string, Blob>,
  urlFor: (blob: Blob) => string = blobUrl,
): LoadedPack[] {
  if (!overrides.size) return packs.slice();
  const swap = <T extends ResolvedAsset | null>(asset: T): T => {
    const blob = asset ? overrides.get(asset.path) : undefined;
    return (blob && asset ? { path: asset.path, url: urlFor(blob), real: true } : asset) as T;
  };
  const item = (i: LoadedItem): LoadedItem => {
    const photo = i.picturePath ? overrides.get(i.picturePath) : undefined;
    return {
      ...i,
      // The parent's photo; the drawings are kept for screens where not every picture is a photo.
      images: photo ? [{ path: i.picturePath!, url: urlFor(photo), real: true, photo: true }] : i.images,
      ...(photo ? { drawings: i.images.filter((a) => a.real) } : {}),
      sound: swap(i.sound),
      nameAudio: { ar: swap(i.nameAudio.ar), en: swap(i.nameAudio.en) },
      ...(i.prompts ? { prompts: i.prompts.map(item) } : {}),
      ...(i.point ? { point: point(i.point) } : {}),
    };
  };
  const point = (lines: NonNullable<LoadedItem['point']>) =>
    Object.fromEntries(
      Object.entries(lines).map(([voice, line]) => [voice, { ...line, audio: swap(line.audio) }]),
    ) as Partial<Record<PointVoice, PointLine>>;
  const feedback = (fb: LoadedFeedback): LoadedFeedback => ({
    correct: { ar: fb.correct.ar.map(swap), en: fb.correct.en.map(swap) },
    incorrectTone: fb.incorrectTone,
    sessionEnd: { ar: swap(fb.sessionEnd.ar), en: swap(fb.sessionEnd.en) },
    ...(fb.oddQuestion ? { oddQuestion: { ar: swap(fb.oddQuestion.ar), en: swap(fb.oddQuestion.en) } } : {}),
    ...(fb.peekaboo ? { peekaboo: { ar: swap(fb.peekaboo.ar), en: swap(fb.peekaboo.en) } } : {}),
  });
  const association = (a: LoadedAssociation): LoadedAssociation => ({
    ...a,
    question: { ar: swap(a.question.ar), en: swap(a.question.en) },
    questionFeminine: { ar: swap(a.questionFeminine.ar), en: swap(a.questionFeminine.en) },
    reward: swap(a.reward),
  });
  return packs.map((p) => ({
    ...p,
    items: p.items.map(item),
    feedback: feedback(p.feedback),
    ...(p.association ? { association: association(p.association) } : {}),
  }));
}

/** Saving and removing the parent's recordings and photos. */
export function overrideOps(store: CustomStore, now: () => number = Date.now) {
  const current = async (path: string) => (await store.overrides()).find((o) => o.path === path);
  return {
    async save(path: string, blob: Blob): Promise<void> {
      const before = await current(path);
      await store.putOverride({
        ...before,
        path,
        blob,
        deleted: false,
        mediaVersion: (before?.mediaVersion ?? 0) + 1,
        updatedAt: now(),
      });
    },

    /** Back to the original. Kept as a marker so a signed-in sync removes it everywhere. */
    async remove(path: string): Promise<void> {
      const before = await current(path);
      if (!before || before.deleted) return;
      await store.putOverride({ ...before, blob: null, deleted: true, mediaVersion: before.mediaVersion + 1, updatedAt: now() });
    },
  };
}
