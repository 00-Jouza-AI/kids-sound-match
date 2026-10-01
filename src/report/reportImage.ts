/**
 * Draws the Report as one picture for the phone's share menu (WhatsApp, email...). Drawn on this
 * device; nothing is uploaded unless the parent sends it somewhere. Shows the child's animal, never
 * a name or photo.
 */
export interface ReportImageRow {
  name: string;
  detail?: string;
  percent: number | null;
}

export interface ReportImageSection {
  title: string;
  /** 'bars': a bar per row; 'good' / 'learn': green or orange percentages. */
  style: 'bars' | 'good' | 'learn';
  rows: ReportImageRow[];
  empty: string;
}

export interface ReportImageData {
  rtl: boolean;
  title: string;
  subtitle: string;
  avatar: { animal: string; color: string } | null;
  stats: { value: string; label: string }[];
  sections: ReportImageSection[];
  footer: string;
}

const W = 1080;
const M = 56;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Arabic', Tahoma, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const C = {
  bg: '#fff8ef',
  card: '#ffffff',
  ink: '#2b2a33',
  muted: '#6b6874',
  line: '#efe6d8',
  primary: '#1f7a6d',
  good: '#2e7d32',
  learn: '#e0752f',
};
const ROW = 74;

function height(d: ReportImageData): number {
  const sections = d.sections.reduce((h, s) => h + 84 + Math.max(1, s.rows.length) * ROW + 24, 0);
  return M + 230 + 36 + 170 + 20 + sections + 90;
}

export function renderReportImage(d: ReportImageData): Promise<Blob> {
  const H = height(d);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.direction = d.rtl ? 'rtl' : 'ltr';
  // Positions are written for left-to-right and mirrored for Arabic.
  const x = (v: number) => (d.rtl ? W - v : v);
  const text = (s: string, at: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: 'start' | 'end' | 'center'; max?: number } = {}) => {
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
    else ctx.rect(at, top, w, h); // older browsers: square corners
    ctx.fill();
  };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: the app, the date, and the child's animal.
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

  // Three numbers.
  let y = M + 230 + 36;
  const gap = 24;
  const boxW = (W - 2 * M - gap * (d.stats.length - 1)) / d.stats.length;
  d.stats.forEach((s, i) => {
    const left = M + i * (boxW + gap);
    rounded(left, y, boxW, 170, 28, C.card);
    text(s.value, left + boxW / 2, y + 68, 60, C.primary, { bold: true, align: 'center' });
    text(s.label, left + boxW / 2, y + 128, 28, C.muted, { align: 'center' });
  });
  y += 170 + 20;

  for (const section of d.sections) {
    const h = 84 + Math.max(1, section.rows.length) * ROW;
    rounded(M, y, W - 2 * M, h, 28, C.card);
    text(section.title, M + 36, y + 46, 36, C.ink, { bold: true });
    let rowY = y + 84 + ROW / 2 - 6;
    if (!section.rows.length) text(section.empty, M + 36, rowY, 28, C.muted);
    for (const row of section.rows) {
      const label = row.detail ? `${row.name} · ${row.detail}` : row.name;
      const value = row.percent === null ? '—' : `${row.percent}%`;
      if (section.style === 'bars') {
        text(label, M + 36, rowY - 14, 30, C.ink, { max: 560 });
        const trackLeft = M + 36;
        const trackW = W - 2 * M - 72 - 120;
        rounded(trackLeft, rowY + 14, trackW, 14, 7, C.line);
        if (row.percent) rounded(trackLeft, rowY + 14, Math.max(14, (trackW * row.percent) / 100), 14, 7, C.primary);
        text(value, W - M - 36, rowY + 4, 32, C.primary, { bold: true, align: 'end' });
      } else {
        text(label, M + 36, rowY, 30, C.ink, { max: W - 2 * M - 72 - 150 });
        text(value, W - M - 36, rowY, 32, section.style === 'good' ? C.good : C.learn, { bold: true, align: 'end' });
      }
      rowY += ROW;
    }
    y += h + 24;
  }

  text(d.footer, W / 2, H - 50, 24, C.muted, { align: 'center', max: W - 2 * M });

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the Report'))), 'image/png'),
  );
}
