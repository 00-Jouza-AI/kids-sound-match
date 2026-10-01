import type { LoadedFeedback, LoadedItem, LoadedPack, ResolvedAsset } from '../content/types';
import { CUSTOM_PACK_PREFIX, itemComplete, type CustomItem, type CustomPack } from './types';

/** Object URLs for stored Blobs, made once per Blob. */
const urls = new WeakMap<Blob, string>();
export function blobUrl(blob: Blob): string {
  let url = urls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(blob, url);
  }
  return url;
}

const CUSTOM_PACK_ORDER = 2000;

export interface CustomPackView {
  /** The pack as the game sees it (only complete items). */
  loaded: LoadedPack;
  /** Everything the parent made, including unfinished items, for the My packs screens. */
  pack: CustomPack;
  items: CustomItem[];
}

/**
 * Turns the parent's packs into regular game packs. Custom packs borrow the praise and soft tone
 * of the built-in pack. An item recorded in one language only uses that recording for both.
 */
export function customToLoaded(
  packs: readonly CustomPack[],
  items: readonly CustomItem[],
  feedback: LoadedFeedback,
  urlFor: (blob: Blob) => string = blobUrl,
): CustomPackView[] {
  const asset = (blob: Blob, path: string): ResolvedAsset => ({ path, url: urlFor(blob), real: true });
  return packs
    .filter((p) => !p.deleted)
    .map((pack) => {
      const own = items.filter((i) => i.packId === pack.id && !i.deleted);
      const playable: LoadedItem[] = own.filter(itemComplete).map((i) => {
        const ar = i.nameAudio.ar ?? i.nameAudio.en!;
        const en = i.nameAudio.en ?? i.nameAudio.ar!;
        return {
          key: i.id,
          name: { ar: i.name.ar || i.name.en, en: i.name.en || i.name.ar },
          images: [{ ...asset(i.picture!, `custom/${i.id}/picture`), photo: i.pictureKind === 'photo' }],
          placeholderImage: null,
          sound: i.sound ? asset(i.sound, `custom/${i.id}/sound`) : null,
          nameAudio: { ar: asset(ar, `custom/${i.id}/name_ar`), en: asset(en, `custom/${i.id}/name_en`) },
          confusableWith: [],
        };
      });
      return {
        pack,
        items: own,
        loaded: {
          id: CUSTOM_PACK_PREFIX + pack.id,
          version: 1,
          name: { ar: pack.name.ar || pack.name.en, en: pack.name.en || pack.name.ar },
          kind: 'match',
          // After the built-in packs and the Mixed game.
          order: CUSTOM_PACK_ORDER,
          items: playable,
          groups: [],
          feedback,
        },
      };
    });
}
