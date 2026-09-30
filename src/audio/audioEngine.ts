import type { Clip, ClipCategory } from './clips';
import { analyzeClip } from './leveling';
import { cancelSpeech, speak, unlockSpeech } from './speech';

interface Prepared {
  buffer: AudioBuffer;
  offset: number;
  duration: number;
  gain: number;
  capped: boolean;
}

export interface AudioLogEntry {
  at: number;
  event: 'start' | 'end';
  label: string;
}

/** Spec: animal sound effects are 1.5-3 s. Longer files are faded out at 3 s. */
const MAX_SOUND_SEC = 3;
const FADE_OUT_SEC = 0.15;
const CACHE_LIMIT = 80;
const DEBUG_LOG = import.meta.env.DEV || __ALLOW_PLACEHOLDERS__;

/**
 * Web Audio playback (the stand-in for ExoPlayer). Clips are decoded once and cached, so a
 * preloaded sound starts within a frame of being asked for. Callers stop everything before
 * starting something new; this class makes stopping reliable.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private readonly cache = new Map<string, Promise<Prepared | null>>();
  private readonly active = new Set<() => void>();
  private readonly stateListeners = new Set<() => void>();
  /** Start/end of every clip, in development and test builds, to check nothing overlaps. */
  readonly log: AudioLogEntry[] = [];

  /** Call from inside a tap: browsers only allow sound after a user gesture. */
  unlock(): void {
    const ctx = this.context();
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // A one-sample silent buffer completes the unlock on iOS.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
    unlockSpeech();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Fires when playback is suspended or resumed by the system (phone call, other apps). */
  onStateChange(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  preload(clips: readonly (Clip | null)[]): void {
    for (const clip of clips) if (clip?.kind === 'file') void this.prepare(clip.url, clip.category);
  }

  /** Plays one clip. Resolves when it ends or is stopped; never rejects. */
  play(clip: Clip, isCancelled: () => boolean): Promise<void> {
    if (clip.kind === 'speech') return this.track(clip.label, () => speak(clip.text, clip.lang, isCancelled));
    return this.playFile(clip, isCancelled);
  }

  stopAll(): void {
    for (const stop of [...this.active]) stop();
    cancelSpeech();
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.ctx.addEventListener('statechange', () => this.stateListeners.forEach((l) => l()));
      // iPhone: keep playing when the ring/silent switch is on silent (newer Safari only).
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) {
        try {
          session.type = 'playback';
        } catch {
          // unsupported
        }
      }
    }
    return this.ctx;
  }

  private prepare(url: string, category: ClipCategory): Promise<Prepared | null> {
    const key = `${category}|${url}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.load(url, category, key);
      this.cache.set(key, pending);
      if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    }
    return pending;
  }

  private async load(url: string, category: ClipCategory, key: string): Promise<Prepared | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await this.context().decodeAudioData(await res.arrayBuffer());
      const a = analyzeClip(buffer.getChannelData(0), buffer.sampleRate, {
        maxDurationSec: category === 'sound' ? MAX_SOUND_SEC : undefined,
      });
      return { buffer, offset: a.startSec, duration: a.durationSec, gain: a.gain, capped: a.capped };
    } catch (e) {
      console.warn('[audio] could not load', url, e);
      this.cache.delete(key); // try again next time
      return null;
    }
  }

  private async playFile(clip: Extract<Clip, { kind: 'file' }>, isCancelled: () => boolean): Promise<void> {
    const prepared = await this.prepare(clip.url, clip.category);
    if (!prepared || isCancelled()) return;
    const ctx = this.context();
    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = prepared.buffer;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(prepared.gain, t0);
      if (prepared.capped) {
        gain.gain.setValueAtTime(prepared.gain, t0 + prepared.duration - FADE_OUT_SEC);
        gain.gain.linearRampToValueAtTime(0.0001, t0 + prepared.duration);
      }
      source.connect(gain).connect(ctx.destination);

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(safety);
        this.active.delete(stop);
        this.record('end', clip.label);
        resolve();
      };
      const stop = () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        finish();
      };
      source.onended = finish;
      this.active.add(stop);
      this.record('start', clip.label);
      source.start(t0, prepared.offset, prepared.duration);
      // If the system suspends audio mid-clip, `ended` never fires: stop it rather than wait forever.
      const safety = window.setTimeout(stop, (prepared.duration + 1.5) * 1000);
    });
  }

  private async track(label: string, run: () => Promise<void>): Promise<void> {
    this.record('start', label);
    try {
      await run();
    } finally {
      this.record('end', label);
    }
  }

  private record(event: AudioLogEntry['event'], label: string): void {
    if (!DEBUG_LOG) return;
    this.log.push({ at: performance.now(), event, label });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }
}

export const audioEngine = new AudioEngine();
