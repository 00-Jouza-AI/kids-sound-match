import { describe, expect, it } from 'vitest';
import { restTime } from './sitting';

describe('the play-time timer', () => {
  it('ends a sitting after its minutes, and never when it is off or no game is on', () => {
    expect(restTime(1_000, 10)).toBe(1_000 + 10 * 60_000);
    expect(restTime(1_000, 0)).toBeNull();
    expect(restTime(null, 10)).toBeNull();
  });
});
