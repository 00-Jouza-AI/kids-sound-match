export type Lang = 'en' | 'ar';
export const LANGS: readonly Lang[] = ['en', 'ar'];

export interface LocalizedText {
  readonly en: string;
  readonly ar: string;
}

/** One entry in a pack's manifest.json (spec 3.2, plus the optional `images` list). */
export interface ManifestItem {
  item_key: string;
  name: LocalizedText;
  /** A single picture. */
  image?: string;
  /** Several pictures of the same animal; one is picked at random each time it appears. */
  images?: string[];
  /** Optional: things that make no sound (clothes, food, family) are played in "name only" mode. */
  sound?: string;
  name_audio: Record<Lang, string>;
  confusable_with?: string[];
  /**
   * Association packs ("Who eats what?"): the items of the prompt pack this answer belongs to
   * (carrot: rabbit, donkey, horse). The question is about one of them.
   */
  prompts?: string[];
  /** Arabic grammatical gender, when the name doesn't show it (أفعى). Otherwise a final ة means feminine. */
  ar_feminine?: boolean;
}

/** A preset for the parent's animal picker. */
export interface ManifestGroup {
  id: string;
  name: LocalizedText;
  items: string[];
}

export interface ManifestFeedback {
  correct: Record<Lang, string[]>;
  incorrect_tone: string;
  session_end: Record<Lang, string>;
}

/**
 * "match": hear a sound or name, tap its picture. "association": see and hear something from the
 * prompt pack (an animal), tap the picture that goes with it (its food).
 */
export type PackKind = 'match' | 'association';

export interface ManifestAssociation {
  /** The pack the questions are about, e.g. "animals". */
  prompt_pack: string;
  /** Said after the prompt item's name: "What does it eat?". */
  question_audio: Partial<Record<Lang, string>>;
  /** The same question for grammatically feminine prompt items, where the language needs it (ماذا تأكل؟). */
  question_audio_feminine?: Partial<Record<Lang, string>>;
  /** Played after a right answer, before the praise (a happy "yum"). */
  reward_audio?: string;
}

export interface PackManifest {
  pack_id: string;
  pack_version: number;
  schema_version: number;
  /** Position in the parent's pack list (lowest first). */
  order?: number;
  kind?: PackKind;
  association?: ManifestAssociation;
  name: LocalizedText;
  /** Present in the V1 manifest but unused: item paths already include the pack folder. */
  asset_root?: string;
  items: ManifestItem[];
  groups?: ManifestGroup[];
  feedback_audio?: ManifestFeedback;
}

/** A content file resolved to a URL. `real` is false for development placeholders. */
export interface ResolvedAsset {
  /** Path under /assets, e.g. "packs/animals/cat_sound.mp3". */
  readonly path: string;
  readonly url: string;
  readonly real: boolean;
}

export interface LoadedItem {
  readonly key: string;
  readonly name: LocalizedText;
  /** Real pictures if the item has any; otherwise its development placeholder. */
  readonly images: readonly ResolvedAsset[];
  /**
   * The development placeholder (emoji) picture, kept even when real photos exist, so a question
   * can show all-emoji instead of mixing photos and emoji. Null in release builds.
   */
  readonly placeholderImage: ResolvedAsset | null;
  /** Null for things without a sound; those only appear in "name only" mode. */
  readonly sound: ResolvedAsset | null;
  readonly nameAudio: Readonly<Record<Lang, ResolvedAsset>>;
  readonly confusableWith: readonly string[];
  /** The manifest path of its main picture ("packs/family/mama.webp"): the key for a parent's own photo. */
  readonly picturePath?: string;
  /** Association packs: the prompt items this answer belongs to (the animals that eat it). */
  readonly prompts?: readonly LoadedItem[];
  /** Arabic grammatical gender, for "ماذا يأكل؟" / "ماذا تأكل؟". */
  readonly arFeminine?: boolean;
}

export interface LoadedFeedback {
  readonly correct: Readonly<Record<Lang, readonly ResolvedAsset[]>>;
  readonly incorrectTone: ResolvedAsset | null;
  readonly sessionEnd: Readonly<Record<Lang, ResolvedAsset | null>>;
}

export interface LoadedAssociation {
  readonly promptPackId: string;
  readonly question: Readonly<Record<Lang, ResolvedAsset | null>>;
  readonly questionFeminine: Readonly<Record<Lang, ResolvedAsset | null>>;
  readonly reward: ResolvedAsset | null;
}

export interface LoadedPack {
  readonly id: string;
  readonly version: number;
  readonly name: LocalizedText;
  readonly kind: PackKind;
  /** Lowest first. */
  readonly order: number;
  /** Association packs only. */
  readonly association?: LoadedAssociation;
  /** The Mixed game: the packs its items come from. */
  readonly parts?: readonly LoadedPack[];
  /** Only items whose every asset resolved. */
  readonly items: readonly LoadedItem[];
  readonly groups: readonly ManifestGroup[];
  readonly feedback: LoadedFeedback;
}

export interface ContentIssue {
  readonly packId: string;
  readonly itemKey?: string;
  readonly message: string;
  /** Errors fail loudly in development; in release the affected item is skipped. */
  readonly level: 'error' | 'warning';
}

export interface LoadedContent {
  readonly packs: readonly LoadedPack[];
  readonly issues: readonly ContentIssue[];
}
