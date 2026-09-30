import emojiMap from './placeholder-emoji.json';

/** Same font stack the placeholder SVGs use (tools/generate-placeholders.mjs). */
const EMOJI_FONTS = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif";
const emojiByKey: Record<string, string> = emojiMap;
const cache = new Map<string, boolean>();

/**
 * Newer emoji (the donkey is from 2022) show as an empty box on older phones. A placeholder
 * picture the device can't draw is treated as missing, so that animal is simply left out.
 */
export function placeholderPictureUsable(itemKey: string): boolean {
  const emoji = emojiByKey[itemKey];
  if (!emoji) return true; // spec-style coloured square with the name: always drawable
  let ok = cache.get(emoji);
  if (ok === undefined) {
    ok = canDraw(emoji);
    cache.set(emoji, ok);
  }
  return ok;
}

function canDraw(emoji: string): boolean {
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    const render = (text: string) => {
      ctx.clearRect(0, 0, size, size);
      ctx.textBaseline = 'top';
      ctx.font = `${size - 4}px ${EMOJI_FONTS}`;
      ctx.fillText(text, 0, 0);
      return ctx.getImageData(0, 0, size, size).data;
    };
    const glyph = render(emoji);
    // A private-use code point no font draws: this is what "missing" looks like on this device.
    const missing = render('\u{10FFFD}');
    let differs = false;
    let inked = false;
    for (let i = 0; i < glyph.length && !(differs && inked); i++) {
      if (glyph[i] !== missing[i]) differs = true;
      if (i % 4 === 3 && glyph[i] > 0) inked = true;
    }
    return differs && inked;
  } catch {
    return true;
  }
}
