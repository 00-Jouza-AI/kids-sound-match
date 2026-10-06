import { useLayoutEffect, useState, type RefObject } from 'react';
import type { LoadedItem } from '../../content/types';

export type Orientation = 'portrait' | 'landscape';

/**
 * Spec 6.4, with the agreed change for 2 pictures: stacked when the phone is upright (each picture
 * ~35% of the screen instead of ~12%), side by side when it's sideways. 3 pictures: 2 + 1 upright,
 * one row sideways. 4 pictures: 2 x 2. Returns option indexes per row.
 */
export function layoutRows(count: number, orientation: Orientation): number[][] {
  if (count <= 1) return [[0]];
  if (count === 2) return orientation === 'portrait' ? [[0], [1]] : [[0, 1]];
  if (count === 3) return orientation === 'portrait' ? [[0, 1], [2]] : [[0, 1, 2]];
  if (count === 4) return [[0, 1], [2, 3]];
  // 5 to 10 pictures: 2 across when upright (5 is 2 + 2 + 1), two rows when sideways (7 is 4 + 3).
  const perRow = orientation === 'portrait' ? 2 : Math.ceil(count / 2);
  const rows: number[][] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Array.from({ length: Math.min(perRow, count - i) }, (_, j) => i + j));
  return rows;
}

/** Explore mode: up to 6 animals, 2 across when upright and 3 across when sideways. */
export function exploreRows(count: number, orientation: Orientation): number[][] {
  const perRow = orientation === 'portrait' ? 2 : 3;
  const rows: number[][] = [];
  for (let i = 0; i < count; i += perRow) rows.push(Array.from({ length: Math.min(perRow, count - i) }, (_, j) => i + j));
  return rows;
}

/** Tracks an element's size, for fitting square pictures into it. */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

/** The largest square picture that fits `rows` into the box, plus the gap between pictures. */
export function fitSquares(box: { w: number; h: number }, rows: readonly (readonly number[])[]) {
  const gap = Math.round(Math.min(box.w, box.h) * 0.04) + 8;
  const cols = Math.max(...rows.map((r) => r.length));
  const size = Math.floor(Math.min((box.w - gap * (cols - 1)) / cols, (box.h - gap * (rows.length - 1)) / rows.length));
  return { size: Math.max(0, size), gap };
}

/**
 * Photos or emoji, never both on one screen: a photo next to emoji stands out and becomes the
 * clue instead of the sound. Shows photos only when every animal shown has one.
 */
export function choosePictures(items: readonly LoadedItem[], random: () => number = Math.random): Record<string, string> {
  // One kind of picture per screen: photos if every item has one, else drawings if every item has
  // one, else the development placeholders. A parent's photo of Grandma next to drawings would
  // become the clue instead of the word.
  const photos = items.map((i) => i.images.filter((a) => a.photo));
  const drawings = items.map((i) => [...i.images.filter((a) => a.real && !a.photo), ...(i.drawings ?? [])]);
  const tier = photos.every((p) => p.length) ? photos : drawings.every((d) => d.length) ? drawings : null;
  const pickFrom = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  if (!tier) return Object.fromEntries(items.map((i) => [i.key, (i.placeholderImage ?? pickFrom(i.images)).url]));
  // Pictures drawn as a series (Counting: dots, apples, stars...) use the same one across the
  // question, so "3" and "5" are both apples.
  const series = tier[0].length > 1 && tier.every((t) => t.length === tier[0].length);
  const index = series ? Math.floor(random() * tier[0].length) : 0;
  return Object.fromEntries(items.map((i, k) => [i.key, (series ? tier[k][index] : pickFrom(tier[k])).url]));
}
