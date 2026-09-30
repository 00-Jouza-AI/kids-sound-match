import { feedbackAssetPath, itemAssetPath, placeholderPathFor } from './paths';
import {
  LANGS,
  type ContentIssue,
  type Lang,
  type LoadedAssociation,
  type LoadedContent,
  type LoadedFeedback,
  type LoadedItem,
  type LoadedPack,
  type ManifestItem,
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
  const manifests = new Map<string, PackManifest>();

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

    manifests.set(manifest.pack_id, manifest);
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
          picturePath: itemAssetPath(item.image ?? item.images![0]),
          arFeminine: arabicFeminine(item),
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

    const assoc = manifest.association;
    const association: LoadedAssociation | undefined =
      manifest.kind === 'association' && assoc
        ? {
            promptPackId: assoc.prompt_pack,
            question: perLang((lang) => feedbackAsset(assoc.question_audio?.[lang])),
            questionFeminine: perLang((lang) => feedbackAsset(assoc.question_audio_feminine?.[lang])),
            reward: feedbackAsset(assoc.reward_audio),
          }
        : undefined;
    if (manifest.kind === 'association' && !assoc) {
      issues.push({ packId: manifest.pack_id, message: 'An association pack needs an "association" block', level: 'error' });
      continue;
    }

    packs.push({
      id: manifest.pack_id,
      version: manifest.pack_version,
      name: manifest.name,
      kind: association ? 'association' : 'match',
      order: typeof manifest.order === 'number' ? manifest.order : DEFAULT_ORDER,
      ...(association ? { association } : {}),
      items,
      groups: (manifest.groups ?? []).map((g) => ({ ...g, items: g.items.filter((k) => validation.validKeys.has(k)) })),
      feedback,
    });
  }

  const resolved = packs.flatMap((pack) => {
    if (pack.kind !== 'association') return [pack];
    const linked = linkPrompts(pack, manifests, packs);
    issues.push(...linked.issues);
    return linked.pack ? [linked.pack] : [];
  });
  resolved.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { packs: resolved, issues };
}

const DEFAULT_ORDER = 1000;

/** Arabic nouns ending in ة are feminine; a manifest can say so for the others (أفعى). */
function arabicFeminine(item: ManifestItem): boolean {
  return typeof item.ar_feminine === 'boolean' ? item.ar_feminine : /ةs*$/.test(item.name?.ar ?? '');
}

/**
 * An association pack's answers point at items of another pack (carrot: rabbit, donkey, horse).
 * Answers whose prompt items are all unavailable (say, an emoji this phone can't draw) are left out.
 */
function linkPrompts(
  pack: LoadedPack,
  manifests: ReadonlyMap<string, PackManifest>,
  packs: readonly LoadedPack[],
): { pack: LoadedPack | null; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const promptPackId = pack.association!.promptPackId;
  const promptManifest = manifests.get(promptPackId);
  const promptPack = packs.find((p) => p.id === promptPackId && p.kind === 'match');
  if (!promptManifest || !promptPack) {
    issues.push({ packId: pack.id, message: `Prompt pack "${promptPackId}" is missing`, level: 'error' });
    return { pack: null, issues };
  }
  const known = new Set(promptManifest.items.map((i) => i.item_key));
  const available = new Map(promptPack.items.map((i) => [i.key, i]));
  const raw = new Map((manifests.get(pack.id)?.items ?? []).map((i) => [i.item_key, i.prompts]));

  const items = pack.items.flatMap((item) => {
    const keys = raw.get(item.key) ?? []; // validatePack already failed answers without prompts
    for (const k of keys) {
      if (!known.has(k)) issues.push({ packId: pack.id, itemKey: item.key, message: `prompts names unknown item "${k}"`, level: 'error' });
    }
    const prompts = keys.map((k) => available.get(k)).filter((p): p is LoadedItem => p !== undefined);
    return prompts.length ? [{ ...item, prompts }] : [];
  });
  if (items.length < MIN_ITEMS_PER_PACK) {
    issues.push({ packId: pack.id, message: `Only ${items.length} answers have a prompt item available`, level: 'warning' });
    return { pack: null, issues };
  }
  const keys = new Set(items.map((i) => i.key));
  return {
    pack: { ...pack, items: items.map((i) => ({ ...i, confusableWith: i.confusableWith.filter((k) => keys.has(k)) })) },
    issues,
  };
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
