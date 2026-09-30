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

export interface PackManifest {
  pack_id: string;
  pack_version: number;
  schema_version: number;
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
}

export interface LoadedFeedback {
  readonly correct: Readonly<Record<Lang, readonly ResolvedAsset[]>>;
  readonly incorrectTone: ResolvedAsset | null;
  readonly sessionEnd: Readonly<Record<Lang, ResolvedAsset | null>>;
}

export interface LoadedPack {
  readonly id: string;
  readonly version: number;
  readonly name: LocalizedText;
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
