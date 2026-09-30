import type { Lang, LoadedItem, LoadedPack, ResolvedAsset } from '../content/types';
import { speechAvailable } from './speech';

export type ClipCategory = 'sound' | 'name' | 'feedback';

export type Clip =
  | { kind: 'file'; url: string; category: ClipCategory; label: string }
  | { kind: 'speech'; text: string; lang: Lang; label: string };

/**
 * What the stand-in voice says for each feedback clip until the recordings exist. Mirrors the
 * recording script, with the agreed gender-neutral Arabic lines (جميل! and انتهينا! برافو!).
 */
export const FEEDBACK_SPEECH: Record<string, string> = {
  'feedback/correct_ar_1.mp3': 'جميل!',
  'feedback/correct_ar_2.mp3': 'برافو!',
  'feedback/correct_ar_3.mp3': 'ممتاز!',
  'feedback/correct_ar_4.mp3': 'رائع!',
  'feedback/correct_ar_5.mp3': 'يا سلام!',
  'feedback/correct_en_1.mp3': 'Hooray!',
  'feedback/correct_en_2.mp3': 'Well done!',
  'feedback/correct_en_3.mp3': 'Great job!',
  'feedback/correct_en_4.mp3': 'Yes!',
  'feedback/correct_en_5.mp3': 'Amazing!',
  'feedback/session_end_ar.mp3': 'انتهينا! برافو!',
  'feedback/session_end_en.mp3': 'Well done! You finished the game',
};

/**
 * Picks what to play for each moment: a real recording, else (development only) the device
 * voice, else a tone. `languages` is the spoken order: ['ar'], ['en'] or ['ar', 'en'] for Both.
 */
export class ClipResolver {
  constructor(
    private readonly pack: LoadedPack,
    private readonly languages: readonly Lang[],
  ) {}

  /** Null for things without a sound. */
  sound(item: LoadedItem): Clip | null {
    return item.sound ? file(item.sound, 'sound', `sound:${item.key}`) : null;
  }

  /** The name in each spoken language, in order ("قطة… Cat" for Both). */
  names(item: LoadedItem): Clip[] {
    const clips = this.languages.map((lang) => this.voiced(item.nameAudio[lang], item.name[lang], lang, 'name', `name:${item.key}:${lang}`));
    // A parent's item recorded in one language uses that recording for both: say it once.
    return clips.filter((c, i) => c.kind !== 'file' || clips.findIndex((o) => o.kind === 'file' && o.url === c.url) === i);
  }

  /** One praise line, in a random spoken language. */
  correct(random: () => number): Clip | null {
    const lang = this.languages[Math.floor(random() * this.languages.length)];
    const options = this.pack.feedback.correct[lang];
    if (!options.length) return null;
    const asset = options[Math.floor(random() * options.length)];
    return this.voiced(asset, FEEDBACK_SPEECH[asset.path], lang, 'feedback', `praise:${asset.path}`);
  }

  incorrectTone(): Clip | null {
    const asset = this.pack.feedback.incorrectTone;
    return asset ? file(asset, 'feedback', 'incorrect') : null;
  }

  sessionEnd(): Clip[] {
    return this.languages.flatMap((lang) => {
      const asset = this.pack.feedback.sessionEnd[lang];
      return asset ? [this.voiced(asset, FEEDBACK_SPEECH[asset.path], lang, 'feedback', `session-end:${lang}`)] : [];
    });
  }

  /** Every clip a set of animals might need, for preloading. */
  clipsFor(items: readonly LoadedItem[]): Clip[] {
    return items.flatMap((i) => [this.sound(i), ...this.names(i)]).filter(isClip);
  }

  feedbackClips(): Clip[] {
    const praise = this.languages.flatMap((lang) =>
      this.pack.feedback.correct[lang].map((a) => this.voiced(a, FEEDBACK_SPEECH[a.path], lang, 'feedback', a.path)),
    );
    return [this.incorrectTone(), ...this.sessionEnd(), ...praise].filter(isClip);
  }

  private voiced(asset: ResolvedAsset, text: string | undefined, lang: Lang, category: ClipCategory, label: string): Clip {
    // Placeholders only resolve in development/test builds, so release builds never reach speech.
    if (!asset.real && text && speechAvailable(lang)) return { kind: 'speech', text, lang, label };
    return file(asset, category, label);
  }
}

function file(asset: ResolvedAsset, category: ClipCategory, label: string): Clip {
  return { kind: 'file', url: asset.url, category, label };
}

function isClip(c: Clip | null): c is Clip {
  return c !== null;
}
