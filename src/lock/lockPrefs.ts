import type { LocalizedText } from '../content/types';
import { local } from '../settings/storage';
import { createPinRecord, verifyPin, type PinRecord } from './pin';

/** How long the corner circle must be held to leave a game. */
export const HOLD_SECONDS = [3, 5, 7, 10] as const;
export type HoldSeconds = (typeof HOLD_SECONDS)[number];

/** What leaving a game asks for: the number PIN, or 4 pictures tapped in order. Settings and the Report always use the PIN. */
export type ExitLock = 'pin' | 'pictures';

/** For the whole phone, like the PIN (not per child). */
export interface LockPrefs {
  holdSec: HoldSeconds;
  exitLock: ExitLock;
}

export const DEFAULT_LOCK_PREFS: LockPrefs = { holdSec: 3, exitLock: 'pin' };
const PREFS_KEY = 'ksm.lockPrefs.v1';
const PICTURE_CODE_KEY = 'ksm.pictureCode.v1';

export function sanitizeLockPrefs(raw: unknown): LockPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Partial<LockPrefs>) : {};
  return {
    holdSec: (HOLD_SECONDS as readonly number[]).includes(r.holdSec as number) ? (r.holdSec as HoldSeconds) : DEFAULT_LOCK_PREFS.holdSec,
    exitLock: r.exitLock === 'pictures' ? 'pictures' : 'pin',
  };
}

export function loadLockPrefs(): LockPrefs {
  const prefs = sanitizeLockPrefs(local.getJson(PREFS_KEY));
  // Pictures without a saved picture code would lock the parent out: fall back to the PIN.
  return prefs.exitLock === 'pictures' && !loadPictureCode() ? { ...prefs, exitLock: 'pin' } : prefs;
}

export function saveLockPrefs(prefs: LockPrefs): void {
  local.setJson(PREFS_KEY, prefs);
}

/**
 * The 9 pictures of the picture lock, in a fixed order: a saved code is their positions, so this
 * order must never change.
 */
export const LOCK_PICTURES: readonly { id: string; path: string; name: LocalizedText }[] = [
  { id: 'cat', path: 'packs/animals/cat.svg', name: { en: 'Cat', ar: 'قطة' } },
  { id: 'dog', path: 'packs/animals/dog.svg', name: { en: 'Dog', ar: 'كلب' } },
  { id: 'frog', path: 'packs/animals/frog.svg', name: { en: 'Frog', ar: 'ضفدع' } },
  { id: 'apple', path: 'packs/food/apple.svg', name: { en: 'Apple', ar: 'تفاحة' } },
  { id: 'banana', path: 'packs/food/banana.svg', name: { en: 'Banana', ar: 'موزة' } },
  { id: 'car', path: 'packs/vehicles/car.svg', name: { en: 'Car', ar: 'سيارة' } },
  { id: 'ball', path: 'packs/first-words/ball.svg', name: { en: 'Ball', ar: 'كرة' } },
  { id: 'rocket', path: 'packs/vehicles/rocket.svg', name: { en: 'Rocket', ar: 'صاروخ' } },
  { id: 'star', path: 'packs/shapes/shape_star.svg', name: { en: 'Star', ar: 'نجمة' } },
];

export const PICTURE_CODE_LENGTH = 4;

/** A picture code is kept like the PIN: the positions (1-9) as 4 digits, salted and hashed. */
export function pictureCodeString(positions: readonly number[]): string {
  return positions.map((p) => String(p + 1)).join('');
}

export async function createPictureCode(positions: readonly number[]): Promise<PinRecord> {
  if (positions.length !== PICTURE_CODE_LENGTH || positions.some((p) => p < 0 || p >= LOCK_PICTURES.length)) {
    throw new Error('A picture code is 4 of the 9 pictures');
  }
  return createPinRecord(pictureCodeString(positions));
}

export function verifyPictureCode(positions: readonly number[], record: PinRecord): Promise<boolean> {
  return verifyPin(pictureCodeString(positions), record);
}

export function loadPictureCode(): PinRecord | null {
  const r = local.getJson<PinRecord>(PICTURE_CODE_KEY);
  return r && typeof r.salt === 'string' && typeof r.hash === 'string' ? r : null;
}

export function savePictureCode(record: PinRecord): void {
  local.setJson(PICTURE_CODE_KEY, record);
}
