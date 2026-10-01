import type { LoadedItem } from '../content/types';
import type { GameMode } from '../settings/settings';
import type { AudioEngine } from './audioEngine';
import type { Clip, ClipResolver } from './clips';

interface Token {
  cancelled: boolean;
}

export interface GameAudioOptions {
  mode: GameMode;
  repeatIntervalSec: number;
  random: () => number;
}

/**
 * Everything Kid Mode plays (spec 7). Each action begins by stopping whatever is playing or
 * scheduled, so two clips can never overlap.
 */
export class GameAudio {
  private token: Token | null = null;
  private wakeWait: (() => void) | null = null;

  constructor(
    private readonly engine: AudioEngine,
    private readonly clips: ClipResolver,
    private readonly options: GameAudioOptions,
  ) {}

  stop(): void {
    if (this.token) this.token.cancelled = true;
    this.token = null;
    this.wakeWait?.();
    this.wakeWait = null;
    this.engine.stopAll();
  }

  /**
   * Spec 7.1, per mode: the sound, then the name(s); only the sound; or only the name(s)
   * ("Where's the cat?"). A pause, then again until stopped.
   * Association games (`about` = the animal): its sound, then "Cow! What does it eat?" in every mode.
   */
  async prompt(target: LoadedItem, about?: LoadedItem, odd = false): Promise<void> {
    const token = this.begin();
    const { mode } = this.options;
    while (!token.cancelled) {
      if (odd) {
        // Odd one out: "Which one is different?"; the pictures say the rest.
        await this.playAll(this.clips.oddQuestion(), token);
      } else if (about) {
        await this.play(this.clips.sound(about), token);
        await this.playAll(this.clips.askAbout(about), token);
      } else {
        if (mode !== 'NAME_ONLY') await this.play(this.clips.sound(target), token);
        if (mode !== 'SOUND_ONLY') await this.playAll(this.clips.names(target), token);
      }
      await this.wait(this.options.repeatIntervalSec * 1000, token);
    }
  }

  /** Wrong tap: the soft tone, then the question again straight away. */
  async wrong(target: LoadedItem, about?: LoadedItem, odd = false): Promise<void> {
    const token = this.begin();
    await this.play(this.clips.incorrectTone(), token);
    if (!token.cancelled) void this.prompt(target, about, odd);
  }

  /** Right tap: the name, then praise. Association games add a "yum" in between. Resolves when done or stopped. */
  async correct(item: LoadedItem, eaten = false): Promise<void> {
    const token = this.begin();
    await this.playAll(this.clips.names(item), token);
    if (eaten) await this.play(this.clips.reward(), token);
    await this.play(this.clips.correct(this.options.random), token);
  }

  /** Toddler mode: the tapped animal's own sound and name, then praise. */
  async toddler(item: LoadedItem): Promise<void> {
    const token = this.begin();
    await this.play(this.clips.sound(item), token);
    await this.playAll(this.clips.names(item), token);
    await this.play(this.clips.correct(this.options.random), token);
  }

  /** Explore mode: the tapped animal's sound and name, nothing else. */
  async explore(item: LoadedItem): Promise<void> {
    const token = this.begin();
    await this.play(this.clips.sound(item), token);
    await this.playAll(this.clips.names(item), token);
  }

  async sessionEnd(): Promise<void> {
    const token = this.begin();
    await this.playAll(this.clips.sessionEnd(), token);
  }

  /** Spec 7.2: load the clips for what's on screen and what comes next before they're needed. */
  preload(items: readonly LoadedItem[], includeFeedback = false): void {
    this.engine.preload(this.clips.clipsFor(items));
    if (includeFeedback) this.engine.preload(this.clips.feedbackClips());
  }

  private begin(): Token {
    this.stop();
    const token = { cancelled: false };
    this.token = token;
    return token;
  }

  private async play(clip: Clip | null, token: Token): Promise<void> {
    if (!clip || token.cancelled) return;
    await this.engine.play(clip, () => token.cancelled);
  }

  private async playAll(clips: readonly Clip[], token: Token): Promise<void> {
    for (const clip of clips) await this.play(clip, token);
  }

  private wait(ms: number, token: Token): Promise<void> {
    return new Promise((resolve) => {
      if (token.cancelled) {
        resolve();
        return;
      }
      const done = () => {
        window.clearTimeout(timer);
        if (this.wakeWait === done) this.wakeWait = null;
        resolve();
      };
      const timer = window.setTimeout(done, ms);
      this.wakeWait = done;
    });
  }
}
