/** Pictures are stored as 720 x 720 squares: sharp on phones, ~60-120 KB each. */
export const PICTURE_SIZE = 720;
const EMOJI_FONTS = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif";

/**
 * Loads a chosen or camera photo. Browsers apply the phone's rotation (EXIF) for us. The image's
 * `src` stays valid (the cropper shows it); call `releaseImage` when done with it.
 */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not a picture the browser can open'));
    };
    img.src = url;
  });
}

export function releaseImage(img: HTMLImageElement): void {
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
}

/** The visible square, in the source image's pixels. */
export interface CropSquare {
  x: number;
  y: number;
  size: number;
}

/** Largest centred square: the starting crop. */
export function centredSquare(width: number, height: number): CropSquare {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/** Keeps the crop inside the image after a drag or zoom. */
export function clampCrop(crop: CropSquare, width: number, height: number): CropSquare {
  const size = Math.min(crop.size, width, height);
  return {
    size,
    x: Math.min(Math.max(0, crop.x), width - size),
    y: Math.min(Math.max(0, crop.y), height - size),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the picture'))), type, quality),
  );
}

export async function cropToBlob(img: HTMLImageElement, crop: CropSquare): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PICTURE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
  return toBlob(canvas, 'image/jpeg', 0.86);
}

/** An icon (emoji) drawn into a transparent square picture. */
export async function iconToBlob(emoji: string): Promise<Blob> {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.78)}px ${EMOJI_FONTS}`;
  ctx.fillText(emoji, size / 2, size * 0.54);
  return toBlob(canvas, 'image/png');
}

/** Kid-friendly icons for things around the house, grouped for the picker. */
export const ICONS: readonly string[] = [
  '👩', '👨', '👧', '👦', '👶', '👵', '👴', '👩‍🍼',
  '🧸', '🚗', '🚌', '🚲', '✈️', '🚂', '🚒', '⚽', '🎈', '🪀', '🧩', '🥁',
  '🍎', '🍌', '🍊', '🍇', '🍉', '🍓', '🥕', '🍞', '🥛', '🧃', '🍪', '🍦', '🧀', '🥚',
  '👕', '👖', '👗', '👟', '🧢', '🧦', '👓', '🧤',
  '🛏️', '🪑', '🚪', '🛁', '🪥', '🧼', '📱', '📺', '💡', '🔑', '⏰', '📚',
  '☀️', '🌙', '⭐', '🌧️', '🌳', '🌸', '🌈', '❄️',
];
