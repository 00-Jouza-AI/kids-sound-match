import { describe, expect, it } from 'vitest';
import { analyzeClip, dbToGain } from './leveling';

const RATE = 22050;

function clip(parts: { seconds: number; amplitude: number }[]): Float32Array {
  const total = parts.reduce((n, p) => n + Math.round(p.seconds * RATE), 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    const n = Math.round(p.seconds * RATE);
    for (let i = 0; i < n; i++) out[offset + i] = p.amplitude * Math.sin((2 * Math.PI * 440 * i) / RATE);
    offset += n;
  }
  return out;
}

describe('clip leveling', () => {
  it('trims leading and trailing silence, keeping ~50 ms before and ~100 ms after', () => {
    const a = analyzeClip(clip([{ seconds: 0.5, amplitude: 0 }, { seconds: 1, amplitude: 0.1 }, { seconds: 0.7, amplitude: 0 }]), RATE);
    expect(a.startSec).toBeCloseTo(0.45, 2);
    expect(a.durationSec).toBeCloseTo(1.15, 2);
  });

  it('brings quiet and loud clips to the same loudness', () => {
    const quiet = analyzeClip(clip([{ seconds: 1, amplitude: 0.05 }]), RATE);
    const loud = analyzeClip(clip([{ seconds: 1, amplitude: 0.4 }]), RATE);
    const rms = (amp: number) => amp / Math.SQRT2;
    expect(rms(0.05) * quiet.gain).toBeCloseTo(dbToGain(-20), 3);
    expect(rms(0.4) * loud.gain).toBeCloseTo(dbToGain(-20), 3);
  });

  it('never pushes the peak above -1 dBFS', () => {
    const spiky = new Float32Array(RATE);
    spiky[100] = 0.9; // one loud click in near silence
    for (let i = 200; i < RATE; i++) spiky[i] = 0.01 * Math.sin(i / 3);
    const a = analyzeClip(spiky, RATE);
    expect(spiky[100] * a.gain).toBeLessThanOrEqual(dbToGain(-1) + 1e-9);
  });

  it('caps long animal sounds', () => {
    const a = analyzeClip(clip([{ seconds: 4.4, amplitude: 0.2 }]), RATE, { maxDurationSec: 3 });
    expect(a.durationSec).toBe(3);
    expect(a.capped).toBe(true);
  });

  it('leaves a silent clip alone', () => {
    expect(analyzeClip(new Float32Array(RATE), RATE)).toEqual({ startSec: 0, durationSec: 1, gain: 1, capped: false });
  });
});
