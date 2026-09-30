import { feedbackAssetPath, itemAssetPath, placeholderPathFor } from './paths';
import {
  LANGS,
  type ContentIssue,
  type Lang,
  type LoadedContent,
  type LoadedFeedback,
  type LoadedItem,
  type LoadedPack,
  type PackManifest,
  type ResolvedAsset,
} from './types';
import { itemPictures, MIN_ITEMS_PER_PACK, validatePack } from './validate';

/** Shape of /assets/packs/index.json, written by tools/vite-plugin-ksm.ts. */
export interface AssetIndex {
  packs: string[];
  files: string[];
  placeholders: string[];
}

export interface LoadOptions {
  /** import.meta.env.BASE_URL */
  baseUrl: string;
  allowPlaceholders: boolean;
  fetchJson?: (url: string) => Promise<unknown>;
  /** Placeholder pictures are emoji; lets the browser drop any this device can't draw. */
  placeholderPictureUsable?: (itemKey: string) => boolean;
}

/**
 * Discovers packs from the asset index (browsers can't list folders), resolves every asset
 * to a real file or, in development, a placeholder, and validates each pack. Adding a pack
 * needs no code change: drop packs/<id>/manifest.json and its files into public/assets.
 */
export async function loadContent(opts: LoadOptions): Promise<LoadedContent> {
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const index = (await fetchJson(`${opts.baseUrl}assets/packs/index.json`)) as AssetIndex;
  const realFiles = new Set(index.files);
  const placeholderFiles = new Set(opts.allowPlaceholders ? index.placeholders : []);

  const placeholderOf = (assetPath: string): ResolvedAsset | null => {
    const placeholder = placeholderPathFor(assetPath);
    return placeholder && placeholderFiles.has(placeholder)
      ? { path: assetPath, url: `${opts.baseUrl}placeholders/${encodePath(placeholder)}`, real: false }
      : null;
  };
  const resolve = (assetPath: string): ResolvedAsset | null => {
    if (realFiles.has(assetPath)) return { path: assetPath, url: `${opts.baseUrl}assets/${encodePath(assetPath)}`, real: true };
    return placeholderOf(assetPath);
  };

  const packs: LoadedPack[] = [];
  const issues: ContentIssue[] = [];

  for (const packId of index.packs) {
    let manifest: PackManifest;
    try {
      manifest = (await fetchJson(`${opts.baseUrl}assets/packs/${packId}/manifest.json`)) as PackManifest;
    } catch (e) {
      issues.push({ packId, message: `Could not read manifest.json: ${String(e)}`, level: 'error' });
      continue;
    }

    const pictureOwner = new Map<string, string>();
    for (const item of manifest.items ?? []) {
      for (const p of itemPictures(item)) pictureOwner.set(itemAssetPath(p), item.item_key);
    }
    const usable = (assetPath: string): ResolvedAsset | null => {
      const resolved = resolve(assetPath);
      const owner = pictureOwner.get(assetPath);
      if (resolved && !resolved.real && owner && opts.placeholderPictureUsable && !opts.placeholderPictureUsable(owner)) {
        return null;
      }
      return resolved;
    };

    const validation = validatePack(manifest, (p) => usable(p) !== null);
    issues.push(...validation.issues);
    if (validation.validKeys.size < MIN_ITEMS_PER_PACK) continue;

    const drawablePlaceholder = (itemKey: string, assetPath: string) =>
      opts.placeholderPictureUsable && !opts.placeholderPictureUsable(itemKey) ? null : placeholderOf(assetPath);

    const items: LoadedItem[] = manifest.items
      .filter((item) => validation.validKeys.has(item.item_key))
      .map((item) => {
        const paths = itemPictures(item).map(itemAssetPath);
        const pictures = paths.map(usable).filter(isAsset);
        const photos = pictures.filter((a) => a.real);
        return {
          key: item.item_key,
          name: item.name,
          // Real photos replace the placeholder as soon as there is at least one.
          images: photos.length ? photos : pictures,
          placeholderImage: paths.map((p) => drawablePlaceholder(item.item_key, p)).find(isAsset) ?? null,
          sound: item.sound ? usable(itemAssetPath(item.sound)) : null,
          nameAudio: {
            en: usable(itemAssetPath(item.name_audio.en))!,
            ar: usable(itemAssetPath(item.name_audio.ar))!,
          },
          confusableWith: (item.confusable_with ?? []).filter((k) => validation.validKeys.has(k)),
        };
      });

    const feedbackAsset = (p: string | undefined) => (p ? resolve(feedbackAssetPath(p)) : null);
    const fb = manifest.feedback_audio;
    const feedback: LoadedFeedback = {
      correct: perLang((lang) =>
        (fb?.correct?.[lang] ?? []).map(feedbackAsset).filter((a): a is ResolvedAsset => a !== null),
      ),
      incorrectTone: feedbackAsset(fb?.incorrect_tone),
      sessionEnd: perLang((lang) => feedbackAsset(fb?.session_end?.[lang])),
    };

    packs.push({
      id: manifest.pack_id,
      version: manifest.pack_version,
      name: manifest.name,
      items,
      groups: (manifest.groups ?? []).map((g) => ({ ...g, items: g.items.filter((k) => validation.validKeys.has(k)) })),
      feedback,
    });
  }

  return { packs, issues };
}

function isAsset(a: ResolvedAsset | null | undefined): a is ResolvedAsset {
  return a != null;
}

function perLang<T>(fn: (lang: Lang) => T): Record<Lang, T> {
  return Object.fromEntries(LANGS.map((lang) => [lang, fn(lang)])) as Record<Lang, T>;
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
