import { profileKey } from './profiles';
import { local } from './storage';

/**
 * The sticker album: after each finished game the child gets a sticker of a picture they found,
 * one they don't have yet. Each child has their own album, kept on this phone.
 */
export interface Sticker {
  key: string;
  packId: string;
  at: number;
}

export interface StickerChoice {
  key: string;
  packId: string;
}

const KEY = 'ksm.stickers.v1';

export function loadStickers(profileId: string): Sticker[] {
  const raw = local.getJson<unknown>(profileKey(KEY, profileId));
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is Sticker => s && typeof s.key === 'string' && typeof s.packId === 'string' && typeof s.at === 'number',
  );
}

export function saveStickers(profileId: string, stickers: readonly Sticker[]): void {
  local.setJson(profileKey(KEY, profileId), stickers);
}

export function forgetStickers(profileId: string): void {
  local.remove(profileKey(KEY, profileId));
}

/** A picture from this game the child doesn't have yet; null when they have them all. */
export function pickSticker(
  owned: readonly Sticker[],
  found: readonly StickerChoice[],
  random: () => number = Math.random,
): StickerChoice | null {
  const have = new Set(owned.map((s) => `${s.packId}|${s.key}`));
  const fresh = [...new Map(found.map((f) => [`${f.packId}|${f.key}`, f])).values()].filter(
    (f) => !have.has(`${f.packId}|${f.key}`),
  );
  return fresh.length ? fresh[Math.floor(random() * fresh.length)] : null;
}
