import { local } from '../settings/storage';
import { sha256Hex, toHex } from './sha256';

/** Spec 6.2: the PIN is stored as a salted SHA-256 hash, never as plaintext. */
export interface PinRecord {
  v: 1;
  salt: string;
  hash: string;
}

export interface PinGuard {
  failures: number;
  lockedUntil: number;
}

export const PIN_LENGTH = 4;
export const MAX_TRIES = 3;
export const COOLDOWN_MS = 30_000;
const PIN_KEY = 'ksm.pin.v1';
const GUARD_KEY = 'ksm.pinGuard.v1';

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function hashPin(pin: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${pin}`);
}

export async function createPinRecord(pin: string, salt = randomSalt()): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('A PIN is exactly 4 digits');
  return { v: 1, salt, hash: await hashPin(pin, salt) };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  return (await hashPin(pin, record.salt)) === record.hash;
}

export function loadPinRecord(): PinRecord | null {
  const r = local.getJson<PinRecord>(PIN_KEY);
  return r && typeof r.salt === 'string' && typeof r.hash === 'string' ? r : null;
}

export function savePinRecord(record: PinRecord): void {
  local.setJson(PIN_KEY, record);
}

/** 3 wrong PINs start a 30-second cooldown; a correct PIN clears the count. */
export function afterAttempt(guard: PinGuard, ok: boolean, now: number): PinGuard {
  if (ok) return { failures: 0, lockedUntil: 0 };
  const failures = guard.failures + 1;
  return failures >= MAX_TRIES ? { failures: 0, lockedUntil: now + COOLDOWN_MS } : { failures, lockedUntil: guard.lockedUntil };
}

export function lockRemainingMs(guard: PinGuard, now: number): number {
  return Math.max(0, guard.lockedUntil - now);
}

/** Persisted so reloading the page doesn't skip the cooldown. */
export function loadGuard(): PinGuard {
  const g = local.getJson<PinGuard>(GUARD_KEY);
  return g && typeof g.failures === 'number' && typeof g.lockedUntil === 'number' ? g : { failures: 0, lockedUntil: 0 };
}

export function saveGuard(guard: PinGuard): void {
  local.setJson(GUARD_KEY, guard);
}
