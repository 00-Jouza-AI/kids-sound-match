import type { Lang } from '../../content/types';

interface NamedItem {
  readonly nameAudio: Readonly<Record<Lang, { readonly path: string; readonly real: boolean }>>;
}

/** One name to record in the recording session: which pack, which item, which language. */
export interface QueuedName {
  pack: number;
  item: number;
  lang: Lang;
}

/**
 * The names still read by the phone's voice (no real recording, none of the parent's): every
 * Arabic one first (that's where phones most often lack a voice), then the English ones, pack by
 * pack. A name shared by two packs is asked once.
 */
export function wordsToRecord(packs: readonly { readonly items: readonly NamedItem[] }[], isMine: (path: string) => boolean): QueuedName[] {
  const seen = new Set<string>();
  const out: QueuedName[] = [];
  for (const lang of ['ar', 'en'] as const) {
    packs.forEach((p, pack) =>
      p.items.forEach((item, index) => {
        const asset = item.nameAudio[lang];
        if (asset.real || isMine(asset.path) || seen.has(asset.path)) return;
        seen.add(asset.path);
        out.push({ pack, item: index, lang });
      }),
    );
  }
  return out;
}
