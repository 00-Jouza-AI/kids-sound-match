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
  // "Who eats what?": said after the animal's name. Arabic follows the animal's gender.
  'feedback/eat_question_ar.mp3': 'ماذا يأكل؟',
  'feedback/eat_question_ar_f.mp3': 'ماذا تأكل؟',
  'feedback/eat_question_en.mp3': 'What does it eat?',
  // "Where does it live?"
  'feedback/home_question_ar.mp3': 'أين يعيش؟',
  'feedback/home_question_ar_f.mp3': 'أين تعيش؟',
  'feedback/home_question_en.mp3': 'Where does it live?',
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

  /**
   * Association games: the question after the prompt item's name, in one language
   * ("ماذا تأكل؟" for a cow, "ماذا يأكل؟" for a horse, "What does it eat?").
   */
  question(about: LoadedItem, lang: Lang): Clip | null {
    const assoc = this.pack.association;
    if (!assoc) return null;
    const asset = (about.arFeminine && assoc.questionFeminine[lang]) || assoc.question[lang];
    return asset ? this.voiced(asset, FEEDBACK_SPEECH[asset.path], lang, 'feedback', `question:${asset.path}`) : null;
  }

  /** Association games: the prompt item's name, then the question, in each spoken language. */
  askAbout(about: LoadedItem): Clip[] {
    const names = this.names(about);
    // A name recorded once for both languages (parents' own items) is said once, before the questions.
    if (names.length < this.languages.length) return [...names, ...this.languages.map((l) => this.question(about, l)).filter(isClip)];
    return this.languages.flatMap((lang, i) => [names[i], this.question(about, lang)]).filter(isClip);
  }

  /** Association games: a happy "yum" after a right answer. */
  reward(): Clip | null {
    const asset = this.pack.association?.reward;
    return asset ? file(asset, 'feedback', 'reward') : null;
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
    const assoc = this.pack.association;
    const questions = assoc
      ? this.languages.flatMap((lang) =>
          [assoc.question[lang], assoc.questionFeminine[lang]]
            .filter((a): a is ResolvedAsset => a !== null)
            .map((a) => this.voiced(a, FEEDBACK_SPEECH[a.path], lang, 'feedback', `question:${a.path}`)),
        )
      : [];
    return [this.incorrectTone(), ...this.sessionEnd(), ...praise, ...questions, this.reward()].filter(isClip);
  }

  private voiced(asset: ResolvedAsset, text: string | undefined, lang: Lang, category: ClipCategory, label: string): Clip {
    return voicedClip(asset, text, lang, category, label);
  }
}

/** A recording, or (development only) the device voice reading `text` while the recording is a placeholder. */
export function voicedClip(asset: ResolvedAsset, text: string | undefined, lang: Lang, category: ClipCategory, label: string): Clip {
  // Placeholders only resolve in development/test builds, so release builds never reach speech.
  if (!asset.real && text && speechAvailable(lang)) return { kind: 'speech', text, lang, label };
  return file(asset, category, label);
}

function file(asset: ResolvedAsset, category: ClipCategory, label: string): Clip {
  return { kind: 'file', url: asset.url, category, label };
}

function isClip(c: Clip | null): c is Clip {
  return c !== null;
}
