import type { Lang, LocalizedText } from '../content/types';

/**
 * Packs parents make themselves (family, toys, food...). Stored on the device first; copied to the
 * parent's private cloud space only if they sign in with Google.
 */
export interface CustomPack {
  id: string;
  name: LocalizedText;
  updatedAt: number;
  /** Deleted packs are kept as markers so other signed-in devices learn about the deletion. */
  deleted: boolean;
  /** The account this pack was backed up to. Never uploaded to a different account. */
  ownerId?: string;
  /** `updatedAt` of the version last saved to the cloud. */
  syncedAt?: number;
}

export type MediaName = 'picture' | 'name_ar' | 'name_en' | 'sound';

export interface CustomItem {
  id: string;
  packId: string;
  name: LocalizedText;
  /** Square JPEG (cropped photo) or PNG (icon). Null only for deleted items. */
  picture: Blob | null;
  pictureKind: 'photo' | 'icon';
  /** The name spoken by the parent, in either or both languages. */
  nameAudio: Partial<Record<Lang, Blob>>;
  /** Optional: with a sound the item plays in every mode; without one, in "name only" and Explore. */
  sound: Blob | null;
  /** Bumped whenever the picture or a recording changes, so sync only re-sends media then. */
  mediaVersion: number;
  updatedAt: number;
  deleted: boolean;
  ownerId?: string;
  syncedAt?: number;
  syncedMediaVersion?: number;
}

/** Custom pack ids in the game are prefixed so they can't clash with built-in packs. */
export const CUSTOM_PACK_PREFIX = 'custom:';

export function isCustomPackId(packId: string): boolean {
  return packId.startsWith(CUSTOM_PACK_PREFIX);
}

/** Playable: has a picture and at least one spoken name. */
export function itemComplete(item: CustomItem): boolean {
  return !item.deleted && item.picture !== null && Boolean(item.nameAudio.ar || item.nameAudio.en);
}

/** crypto.randomUUID only exists on HTTPS/localhost; phone testing over Wi-Fi uses plain http. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
