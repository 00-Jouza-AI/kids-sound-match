import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { challengeNumber, numberToWords } from './numberWords';
import { afterAttempt, COOLDOWN_MS, createPinRecord, lockRemainingMs, verifyPin } from './pin';
import { sha256Bytes, toHex } from './sha256';

describe('sha256 fallback (for plain-http Wi-Fi testing)', () => {
  it('matches Node crypto', () => {
    const inputs = ['', 'abc', 'salt:1234', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'قطة 🐱'.repeat(40)];
    for (const input of inputs) {
      const expected = createHash('sha256').update(input, 'utf8').digest('hex');
      expect(toHex(sha256Bytes(new TextEncoder().encode(input)))).toBe(expected);
    }
  });
});

describe('PIN', () => {
  it('stores a salted hash, never the PIN', async () => {
    const a = await createPinRecord('1234', 'aa');
    const b = await createPinRecord('1234', 'bb');
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain('1234');
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('4321', a)).toBe(false);
  });

  it('rejects anything but 4 digits', async () => {
    await expect(createPinRecord('12a4')).rejects.toThrow();
    await expect(createPinRecord('12345')).rejects.toThrow();
  });

  it('starts a 30-second cooldown after 3 wrong PINs', () => {
    const now = 1_000_000;
    let guard = { failures: 0, lockedUntil: 0 };
    guard = afterAttempt(guard, false, now);
    guard = afterAttempt(guard, false, now);
    expect(lockRemainingMs(guard, now)).toBe(0);
    guard = afterAttempt(guard, false, now);
    expect(lockRemainingMs(guard, now)).toBe(COOLDOWN_MS);
    expect(lockRemainingMs(guard, now + COOLDOWN_MS)).toBe(0);
    expect(afterAttempt(guard, true, now)).toEqual({ failures: 0, lockedUntil: 0 });
  });
});

describe('forgot-PIN challenge', () => {
  it('writes numbers out in English and Arabic', () => {
    expect(numberToWords(742, 'en')).toBe('seven hundred forty-two');
    expect(numberToWords(742, 'ar')).toBe('سبعمئة واثنان وأربعون');
    expect(numberToWords(221, 'ar')).toBe('مئتان وواحد وعشرون');
  });

  it('only generates numbers it can write out', () => {
    for (let i = 0; i < 500; i++) {
      const n = challengeNumber();
      expect(() => numberToWords(n, 'en')).not.toThrow();
      expect(() => numberToWords(n, 'ar')).not.toThrow();
    }
  });
});
