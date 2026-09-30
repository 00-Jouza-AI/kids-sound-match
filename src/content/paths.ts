/**
 * Path rules for manifests.
 *
 * Item paths ("animals/cat.webp") are relative to packs/ (spec 3.1), so they live at
 * /assets/packs/animals/cat.webp. Feedback paths ("feedback/correct_en_1.mp3") are resolved from
 * the assets root, matching the folder layout in spec 3.1 (assets/feedback/ sits next to packs/).
 * The V1 manifest's `asset_root` is ignored: the item paths already include the pack folder.
 */
export function itemAssetPath(manifestPath: string): string {
  return `packs/${stripLeadingSlash(manifestPath)}`;
}

export function feedbackAssetPath(manifestPath: string): string {
  return stripLeadingSlash(manifestPath);
}

const IMAGE_EXT = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|opus)$/i;

/** Development placeholders mirror the /assets tree: pictures become .svg, sounds become .wav. */
export function placeholderPathFor(assetPath: string): string | null {
  if (IMAGE_EXT.test(assetPath)) return assetPath.replace(IMAGE_EXT, '.svg');
  if (AUDIO_EXT.test(assetPath)) return assetPath.replace(AUDIO_EXT, '.wav');
  return null;
}

function stripLeadingSlash(p: string): string {
  return p.replace(/^\/+/, '');
}
