/**
 * Loudness leveling, silence trimming and a length cap, applied to every clip at load time.
 *
 * The recording script asks for all clips normalised to -16 LUFS, "or a loud lion followed by a
 * quiet mouse reads as a bug". Downloaded sounds haven't been through that step yet, so the app
 * evens them out itself: gated RMS over 50 ms windows (a close stand-in for LUFS on short clips),
 * a peak ceiling of -1 dBFS, silence trimmed to ~50 ms head / ~100 ms tail as in the script.
 */
export interface ClipAnalysis {
  startSec: number;
  durationSec: number;
  gain: number;
  /** True when the clip was longer than the cap and will be faded out early. */
  capped: boolean;
}

export interface LevelOptions {
  targetRmsDb?: number;
  peakCeilingDb?: number;
  maxDurationSec?: number;
}

const SILENCE_DB = -45;
const GATE_DB = -50;
const HEAD_SEC = 0.05;
const TAIL_SEC = 0.1;
const WINDOW_SEC = 0.05;
const MIN_GAIN = 0.25;
const MAX_GAIN = 4;

export const dbToGain = (db: number) => 10 ** (db / 20);

export function analyzeClip(samples: Float32Array, sampleRate: number, opts: LevelOptions = {}): ClipAnalysis {
  const target = dbToGain(opts.targetRmsDb ?? -20);
  const ceiling = dbToGain(opts.peakCeilingDb ?? -1);
  const silence = dbToGain(SILENCE_DB);

  let first = -1;
  let last = -1;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a > silence) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return { startSec: 0, durationSec: samples.length / sampleRate, gain: 1, capped: false };

  const start = Math.max(0, first - Math.round(HEAD_SEC * sampleRate));
  const end = Math.min(samples.length, last + 1 + Math.round(TAIL_SEC * sampleRate));

  // Gated RMS: ignore near-silent windows (pauses inside the clip) so they don't drag loudness down.
  const windowSize = Math.max(1, Math.round(WINDOW_SEC * sampleRate));
  const gate = dbToGain(GATE_DB);
  let sumSquares = 0;
  let counted = 0;
  for (let w = start; w < end; w += windowSize) {
    const stop = Math.min(end, w + windowSize);
    let s = 0;
    for (let i = w; i < stop; i++) s += samples[i] * samples[i];
    if (Math.sqrt(s / (stop - w)) > gate) {
      sumSquares += s;
      counted += stop - w;
    }
  }
  const rms = counted > 0 ? Math.sqrt(sumSquares / counted) : peak;

  let gain = rms > 0 ? target / rms : 1;
  gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, gain));
  if (peak * gain > ceiling) gain = ceiling / peak;

  let durationSec = (end - start) / sampleRate;
  let capped = false;
  if (opts.maxDurationSec && durationSec > opts.maxDurationSec) {
    durationSec = opts.maxDurationSec;
    capped = true;
  }
  return { startSec: start / sampleRate, durationSec, gain, capped };
}
