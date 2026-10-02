import { ConfusionGraph, pickNonConfusable } from '../engine';
import { feedbackAssetPath, itemAssetPath } from './paths';
import { LANGS, POINT_VOICES, type ContentIssue, type ManifestItem, type PackManifest } from './types';

export const MIN_ITEMS_PER_PACK = 5;
const MAX_CHOICES = 4;

export interface PackValidation {
  readonly issues: ContentIssue[];
  /** Items with no errors; the only ones a release build will show. */
  readonly validKeys: Set<string>;
}

/**
 * Spec 3.4: every asset exists, confusable keys are real and symmetric, at least 5 items.
 * Also warns when a full 4-picture question can't be built for an item (the engine then shows
 * fewer pictures rather than failing).
 */
export function validatePack(manifest: PackManifest, exists: (assetPath: string) => boolean): PackValidation {
  const packId = typeof manifest?.pack_id === 'string' ? manifest.pack_id : '?';
  const issues: ContentIssue[] = [];
  const error = (message: string, itemKey?: string) => issues.push({ packId, itemKey, message, level: 'error' });
  const warn = (message: string, itemKey?: string) => issues.push({ packId, itemKey, message, level: 'warning' });

  if (packId === '?' || !Array.isArray(manifest?.items)) {
    error('Manifest is missing pack_id or items');
    return { issues, validKeys: new Set() };
  }

  const items: ManifestItem[] = manifest.items;
  const allKeys = new Set<string>();
  const invalid = new Set<string>();
  const association = manifest.kind === 'association';
  if (association && typeof manifest.association?.prompt_pack !== 'string') {
    error('An association pack needs "association": { "prompt_pack": ... }');
  }

  for (const item of items) {
    const key = typeof item?.item_key === 'string' ? item.item_key : '';
    if (!key) {
      error('An item has no item_key');
      continue;
    }
    const fail = (message: string) => {
      error(message, key);
      invalid.add(key);
    };
    if (allKeys.has(key)) fail(`Duplicate item_key "${key}"`);
    allKeys.add(key);

    for (const lang of LANGS) {
      if (!item.name?.[lang]?.trim()) fail(`Missing ${lang} name`);
    }
    // Several pictures are optional extras: the item stays playable while at least one exists.
    const pictures = itemPictures(item);
    const foundPictures = pictures.filter((p) => exists(itemAssetPath(p)));
    if (pictures.length === 0) fail('No picture (image or images)');
    else if (foundPictures.length === 0) fail(`picture not found: ${pictures.map(itemAssetPath).join(', ')}`);
    else if (foundPictures.length < pictures.length) {
      const missing = pictures.filter((p) => !foundPictures.includes(p));
      warn(`Some pictures not found and skipped: ${missing.map(itemAssetPath).join(', ')}`, key);
    }
    // The sound is optional (things without a sound are played in "name only" mode), but if a
    // manifest names a sound file, it must exist.
    if (item.sound !== undefined && (typeof item.sound !== 'string' || !item.sound)) fail('Invalid sound path');
    else if (item.sound && !exists(itemAssetPath(item.sound))) fail(`sound not found: ${itemAssetPath(item.sound)}`);
    for (const lang of LANGS) {
      const p = item.name_audio?.[lang];
      if (typeof p !== 'string' || !p) fail(`Missing ${lang} name audio path`);
      else if (!exists(itemAssetPath(p))) fail(`${lang} name audio not found: ${itemAssetPath(p)}`);
    }
    // "Where's your nose?": optional lines; a missing recording only leaves that line out.
    for (const voice of POINT_VOICES) {
      const line = item.point?.[voice];
      if (line === undefined) continue;
      if (typeof line?.text !== 'string' || !line.text.trim() || typeof line.audio !== 'string' || !line.audio) {
        warn(`"point" needs a text and an audio path for ${voice}`, key);
      } else if (!exists(itemAssetPath(line.audio))) {
        warn(`"Where's your…?" line not found: ${itemAssetPath(line.audio)}`, key);
      }
    }
    // "Who eats what?": every answer says which prompt items (animals) it goes with.
    if (association && (!Array.isArray(item.prompts) || !item.prompts.length || item.prompts.some((k) => typeof k !== 'string'))) {
      fail('An answer in an association pack needs "prompts": the items it goes with');
    }
  }

  // Confusable pairs must name real items and be listed on both sides.
  const byKey = new Map(items.filter((i) => typeof i?.item_key === 'string').map((i) => [i.item_key, i]));
  for (const item of byKey.values()) {
    for (const other of item.confusable_with ?? []) {
      const partner = byKey.get(other);
      if (!partner) error(`confusable_with names unknown item "${other}"`, item.item_key);
      else if (!(partner.confusable_with ?? []).includes(item.item_key)) {
        error(`"${item.item_key}" lists "${other}" as confusable but "${other}" doesn't list it back`, item.item_key);
      }
    }
  }

  const validKeys = new Set([...allKeys].filter((k) => !invalid.has(k)));
  if (validKeys.size < MIN_ITEMS_PER_PACK) {
    error(`Only ${validKeys.size} playable items; a pack needs at least ${MIN_ITEMS_PER_PACK}`);
  }

  const engineItems = [...validKeys].map((k) => ({ key: k, confusableWith: byKey.get(k)?.confusable_with ?? [] }));
  const graph = new ConfusionGraph(engineItems);
  for (const target of validKeys) {
    const pool = [...validKeys].filter((k) => k !== target && !graph.areConfusable(target, k));
    const best = pickNonConfusable(pool, MAX_CHOICES - 1, graph).length + 1;
    if (best < MAX_CHOICES && validKeys.size >= MAX_CHOICES) {
      warn(`Only ${best} pictures can be shown together when this is the answer`, target);
    }
  }

  for (const group of manifest.groups ?? []) {
    for (const key of group.items ?? []) {
      if (!allKeys.has(key)) warn(`Group "${group.id}" names unknown item "${key}"`);
    }
  }

  const fb = manifest.feedback_audio;
  if (fb) {
    const feedbackPaths = [
      ...LANGS.flatMap((lang) => fb.correct?.[lang] ?? []),
      fb.incorrect_tone,
      ...LANGS.map((lang) => fb.session_end?.[lang]),
      ...LANGS.map((lang) => fb.odd_question?.[lang]),
      ...LANGS.map((lang) => fb.peekaboo?.[lang]),
    ];
    for (const p of feedbackPaths) {
      if (typeof p === 'string' && p && !exists(feedbackAssetPath(p))) warn(`Feedback audio not found: ${feedbackAssetPath(p)}`);
    }
  } else {
    warn('No feedback_audio; celebrations will be silent');
  }

  const assoc = manifest.association;
  if (association && assoc) {
    const paths = [
      ...Object.values(assoc.question_audio ?? {}),
      ...Object.values(assoc.question_audio_feminine ?? {}),
      assoc.reward_audio,
    ];
    for (const p of paths) {
      if (typeof p === 'string' && p && !exists(feedbackAssetPath(p))) warn(`Question audio not found: ${feedbackAssetPath(p)}`);
    }
  }

  return { issues, validKeys };
}

export function itemPictures(item: ManifestItem): string[] {
  return [...(item.images ?? []), ...(item.image ? [item.image] : [])];
}
