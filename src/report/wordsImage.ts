/**
 * "Words I know" as one picture for the phone's share menu: the child's animal, the counts, and a
 * grid of their words with pictures. Drawn on this device; nothing is uploaded unless the parent
 * sends it somewhere.
 */
export interface WordsImageTile {
  picture: string;
  name: string;
  /** Marked "says it". */
  says: boolean;
}

export interface WordsImageData {
  rtl: boolean;
  title: string;
  subtitle: string;
  avatar: { animal: string; color: string } | null;
  stats: { value: string; label: string }[];
  tiles: WordsImageTile[];
  /** Shown under the grid: "+12 more". */
  more: string | null;
  /** Words outside the app, as text. */
  extraTitle: string;
  extra: string[];
  footer: string;
}

const W = 1080;
const M = 56;
const COLS = 4;
const TILE_H = 250;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', Tahoma, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const C = { bg: '#fff8ef', card: '#ffffff', ink: '#2b2a33', muted: '#6b6874', primary: '#1f7a6d', accent: '#f2894a', says: '#fdeee4' };

function loadPicture(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/** Lines of chips for the extra words, measured with the canvas. */
function chipRows(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[][] {
  ctx.font = `30px ${FONT}`;
  const rows: string[][] = [];
  let row: string[] = [];
  let used = 0;
  for (const w of words) {
    const width = ctx.measureText(w).width + 56;
    if (row.length && used + width > maxW) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(w);
    used += width + 14;
  }
  if (row.length) rows.push(row);
  return rows;
}

export async function renderWordsImage(d: WordsImageData): Promise<Blob> {
  const measure = document.createElement('canvas').getContext('2d')!;
  const extraRows = d.extra.length ? chipRows(measure, d.extra, W - 2 * M - 72) : [];
  const gridRows = Math.ceil(d.tiles.length / COLS);
  const gridH = gridRows ? 36 + gridRows * TILE_H + (d.more ? 60 : 0) + 20 : 0;
  const extraH = extraRows.length ? 90 + extraRows.length * 66 + 24 : 0;
  const H = M + 230 + 36 + 170 + 24 + gridH + (extraH ? extraH + 24 : 0) + 90;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.direction = d.rtl ? 'rtl' : 'ltr';
  const x = (v: number) => (d.rtl ? W - v : v);
  const text = (s: string, at: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: CanvasTextAlign; max?: number } = {}) => {
    ctx.font = `${opts.bold ? '700 ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = opts.align ?? 'start';
    ctx.textBaseline = 'middle';
    let out = s;
    if (opts.max) while (out.length > 1 && ctx.measureText(out).width > opts.max) out = out.slice(0, -2) + '…';
    ctx.fillText(out, x(at), y);
  };
  const rounded = (left: number, top: number, w: number, h: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const at = d.rtl ? W - left - w : left;
    if (ctx.roundRect) ctx.roundRect(at, top, w, h, r);
    else ctx.rect(at, top, w, h);
    ctx.fill();
  };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  rounded(M, M, W - 2 * M, 230, 36, C.primary);
  let textStart = M + 48;
  if (d.avatar) {
    const cx = M + 48 + 70;
    ctx.fillStyle = d.avatar.color;
    ctx.beginPath();
    ctx.arc(x(cx), M + 115, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `76px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.avatar.animal, x(cx), M + 120);
    textStart = cx + 70 + 36;
  }
  text(d.title, textStart, M + 92, 54, '#fff', { bold: true, max: W - M - textStart - 40 });
  text(d.subtitle, textStart, M + 152, 32, 'rgba(255,255,255,0.88)', { max: W - M - textStart - 40 });

  let y = M + 230 + 36;
  const gap = 24;
  const boxW = (W - 2 * M - gap * (d.stats.length - 1)) / d.stats.length;
  d.stats.forEach((s, i) => {
    const left = M + i * (boxW + gap);
    rounded(left, y, boxW, 170, 28, C.card);
    text(s.value, left + boxW / 2, y + 68, 60, C.primary, { bold: true, align: 'center' });
    text(s.label, left + boxW / 2, y + 128, 28, C.muted, { align: 'center', max: boxW - 30 });
  });
  y += 170 + 24;

  if (d.tiles.length) {
    rounded(M, y, W - 2 * M, gridH, 28, C.card);
    const pictures = await Promise.all(d.tiles.map((t) => loadPicture(t.picture)));
    const tileW = (W - 2 * M - 48) / COLS;
    d.tiles.forEach((tile, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const left = M + 24 + col * tileW;
      const top = y + 36 + row * TILE_H;
      if (tile.says) rounded(left + 8, top, tileW - 16, TILE_H - 16, 22, C.says);
      const img = pictures[i];
      if (img) {
        const s = 150;
        const at = d.rtl ? W - (left + tileW / 2) - s / 2 : left + tileW / 2 - s / 2;
        ctx.drawImage(img, at, top + 16, s, s);
      }
      text(tile.name, left + tileW / 2, top + 200, 30, C.ink, { bold: true, align: 'center', max: tileW - 24 });
    });
    if (d.more) text(d.more, W / 2, y + gridH - 50, 28, C.muted, { align: 'center' });
    y += gridH + 24;
  }

  if (extraRows.length) {
    rounded(M, y, W - 2 * M, extraH, 28, C.card);
    text(d.extraTitle, M + 36, y + 50, 34, C.ink, { bold: true });
    let rowY = y + 90 + 33;
    for (const row of extraRows) {
      let left = M + 36;
      for (const w of row) {
        ctx.font = `30px ${FONT}`;
        const width = ctx.measureText(w).width + 56;
        rounded(left, rowY - 26, width, 52, 26, C.says);
        text(w, left + width / 2, rowY, 30, C.ink, { align: 'center' });
        left += width + 14;
      }
      rowY += 66;
    }
    y += extraH + 24;
  }

  text(d.footer, W / 2, H - 50, 24, C.muted, { align: 'center', max: W - 2 * M });

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the words'))), 'image/png'),
  );
}
