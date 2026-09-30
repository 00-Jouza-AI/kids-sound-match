import { analyzeClip } from '../audio/leveling';

/** Recordings are stored as 22.05 kHz mono WAV: small (~44 KB per second) and playable everywhere. */
export const STORE_RATE = 22050;
/** Recordings stop on their own after this long. */
export const MAX_RECORDING_SEC = 10;
const EDGE_FADE_SEC = 0.01;

export interface MonoAudio {
  samples: Float32Array;
  sampleRate: number;
}

/** Decodes any recorded or chosen audio file (WebM, MP4, MP3, WAV...) to mono samples. */
export async function decodeToMono(blob: Blob): Promise<MonoAudio> {
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctor(1, 1, 44100);
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  const samples = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
  }
  return { samples, sampleRate: buffer.sampleRate };
}

export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.max(1, Math.round((samples.length * to) / from)));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    // Average the source samples that fall under this output sample (a simple low-pass).
    const start = i * step;
    const end = Math.min(samples.length, start + Math.max(1, step));
    let sum = 0;
    let n = 0;
    for (let j = Math.floor(start); j < end; j++, n++) sum += samples[j];
    out[i] = n ? sum / n : samples[Math.min(samples.length - 1, Math.floor(start))];
  }
  return out;
}

/** Cuts [startSec, endSec] out of the samples, with a 10 ms fade at each end so it doesn't click. */
export function trimSamples(audio: MonoAudio, startSec: number, endSec: number): Float32Array {
  const start = Math.max(0, Math.floor(startSec * audio.sampleRate));
  const end = Math.min(audio.samples.length, Math.ceil(endSec * audio.sampleRate));
  const out = audio.samples.slice(start, Math.max(start + 1, end));
  const fade = Math.min(Math.floor(out.length / 2), Math.round(EDGE_FADE_SEC * audio.sampleRate));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

/** Where the sound starts and ends, ignoring silence (~50 ms head, ~100 ms tail kept). */
export function suggestTrim(audio: MonoAudio): { start: number; end: number } {
  const a = analyzeClip(audio.samples, audio.sampleRate);
  return { start: a.startSec, end: Math.min(audio.samples.length / audio.sampleRate, a.startSec + a.durationSec) };
}

/** Peak height per bucket, for drawing the waveform. */
export function waveformPeaks(samples: Float32Array, buckets: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / buckets));
  return Array.from({ length: buckets }, (_, b) => {
    let peak = 0;
    for (let i = b * size; i < Math.min(samples.length, (b + 1) * size); i++) peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
  });
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, 'data');
  data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    data.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

/** The trimmed selection as a stored clip. */
export function clipToWav(audio: MonoAudio, startSec: number, endSec: number): Blob {
  return encodeWav(resample(trimSamples(audio, startSec, endSec), audio.sampleRate, STORE_RATE), STORE_RATE);
}
