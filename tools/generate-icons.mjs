// Draws the app icon (same design as public/icon.svg) as PNGs for home-screen installs.
// No dependencies: shapes are rasterised with 4x4 supersampling and written with zlib.
// Run once after changing the design: node tools/generate-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(process.cwd(), 'public');
const BG_A = [0xff, 0xbe, 0x76];
const BG_B = [0xf2, 0x89, 0x4a];
const CREAM = [0xff, 0xf8, 0xef];
const TEAL = [0x1f, 0x7a, 0x6d];
const SPEAKER = [[170, 214], [214, 214], [276, 162], [276, 350], [214, 298], [170, 298]];
const WAVES = [64, 116];
const WAVE_HALF_WIDTH = 11;
const WAVE_ANGLE = (48 * Math.PI) / 180;

function insideRoundedRect(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 512 - radius);
  const cy = Math.min(Math.max(y, radius), 512 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onWave(x, y) {
  const dx = x - 276;
  const dy = y - 256;
  const d = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  for (const r of WAVES) {
    if (Math.abs(angle) <= WAVE_ANGLE && Math.abs(d - r) <= WAVE_HALF_WIDTH) return true;
    for (const sign of [-1, 1]) {
      const ex = 276 + r * Math.cos(sign * WAVE_ANGLE);
      const ey = 256 + r * Math.sin(sign * WAVE_ANGLE);
      if (Math.hypot(x - ex, y - ey) <= WAVE_HALF_WIDTH) return true;
    }
  }
  return false;
}

/** Colour at a point of the 512x512 design, or null outside the icon. */
function sample(x, y, radius) {
  if (!insideRoundedRect(x, y, radius)) return null;
  if (insidePolygon(x, y, SPEAKER) || onWave(x, y)) return TEAL;
  if ((x - 256) ** 2 + (y - 256) ** 2 <= 168 ** 2) return CREAM;
  const t = (x + y) / 1024;
  return BG_A.map((a, i) => a + (BG_B[i] - a) * t);
}

function render(size, radius) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  const n = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = sample((px + (sx + 0.5) / n) * scale, (py + (sy + 0.5) / n) * scale, radius);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
      }
      rgba[o + 3] = Math.round((255 * a) / (n * n));
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, radius] of [
  ['icon-192.png', 192, 112],
  ['icon-512.png', 512, 112],
  ['icon-maskable-512.png', 512, 0], // full square: the launcher applies its own mask
]) {
  fs.writeFileSync(path.join(OUT, name), png(size, render(size, radius)));
  console.log(`[icons] public/${name}`);
}
