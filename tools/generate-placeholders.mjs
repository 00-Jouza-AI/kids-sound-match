// Creates development-only placeholder assets (spec 3.5) in dev-assets/placeholders/, mirroring
// the /assets tree:
//   pictures -> .svg  a large emoji and no text (a coloured square with the English name if an
//                     animal has no emoji)
//   sounds   -> .wav  short tones, a different pitch per animal so sequencing is audible
// Real files in public/assets always take precedence. Release builds never include these files:
// tools/check-release.mjs fails the build if any placeholder marker is found.
// No dependencies: SVG is text and WAV is a 44-byte header plus PCM samples.
import fs from 'node:fs';
import path from 'node:path';
import placeholderEmoji from '../src/content/placeholder-emoji.json' with { type: 'json' };

const ROOT = process.cwd();
const PACKS_DIR = path.join(ROOT, 'public', 'assets', 'packs');
const OUT_DIR = path.join(ROOT, 'dev-assets', 'placeholders');
export const MARKER = 'KSM-PLACEHOLDER';
const EMOJI_FONTS = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif";
const SAMPLE_RATE = 22050;

const IMAGE_EXT = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|opus)$/i;

function placeholderPath(assetPath) {
  if (IMAGE_EXT.test(assetPath)) return assetPath.replace(IMAGE_EXT, '.svg');
  if (AUDIO_EXT.test(assetPath)) return assetPath.replace(AUDIO_EXT, '.wav');
  return null;
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

function hashHue(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

function pictureSvg(item) {
  const emoji = placeholderEmoji[item.item_key];
  if (emoji) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-ksm="${MARKER}">` +
      `<text x="256" y="270" font-size="380" text-anchor="middle" dominant-baseline="central" font-family="${EMOJI_FONTS}">${emoji}</text></svg>\n`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-ksm="${MARKER}">` +
    `<rect width="512" height="512" fill="hsl(${hashHue(item.item_key)} 70% 80%)"/>` +
    `<text x="256" y="256" font-size="72" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" fill="#333">${escapeXml(item.name?.en ?? item.item_key)}</text></svg>\n`;
}

// ---- audio synthesis ------------------------------------------------------------------------

function note(freq, seconds, { partials = [[1, 1, 0.25]], attack = 0.008 } = {}) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / attack);
    let v = 0;
    for (const [mult, amp, decay] of partials) v += amp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * freq * mult * t);
    // short fade at the very end so nothing clicks
    const tail = Math.min(1, (n - i) / (0.01 * SAMPLE_RATE));
    out[i] = v * env * tail;
  }
  return out;
}

const silence = (seconds) => new Float32Array(Math.round(seconds * SAMPLE_RATE));

function join(...parts) {
  const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function mix(...parts) {
  const out = new Float32Array(Math.max(...parts.map((p) => p.length)));
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function normalize(samples, peak) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] / max) * peak;
  return samples;
}

function wav(samples) {
  const comment = Buffer.from(`${MARKER}\0`);
  const icmt = Buffer.concat([comment, Buffer.alloc(comment.length % 2)]);
  const list = Buffer.alloc(12);
  list.write('LIST', 0, 'ascii');
  list.writeUInt32LE(4 + 8 + icmt.length, 4);
  list.write('INFO', 8, 'ascii');
  const icmtHeader = Buffer.alloc(8);
  icmtHeader.write('ICMT', 0, 'ascii');
  icmtHeader.writeUInt32LE(comment.length, 4);
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8); // PCM
  fmt.writeUInt16LE(1, 10); // mono
  fmt.writeUInt32LE(SAMPLE_RATE, 12);
  fmt.writeUInt32LE(SAMPLE_RATE * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0, 'ascii');
  dataHeader.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, icmtHeader, icmt, dataHeader, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

const semitone = (base, steps) => base * 2 ** (steps / 12);
const bright = { partials: [[1, 1, 0.3], [2, 0.3, 0.15]] };

/** Two short beeps at a pitch unique to the animal. */
function animalTone(index) {
  const f = semitone(196, index);
  return normalize(join(note(f, 0.18, bright), silence(0.08), note(f, 0.26, bright)), 0.5);
}

/** Name placeholders: one blip for English, two quick blips for Arabic. */
function nameTone(index, lang) {
  const f = semitone(392, index % 12);
  const blip = (s) => note(f, s, { partials: [[1, 1, 0.2], [3, 0.15, 0.08]] });
  return normalize(lang === 'ar' ? join(blip(0.1), silence(0.05), blip(0.1)) : blip(0.24), 0.45);
}

function arpeggio(freqs, step, last) {
  return normalize(
    mix(...freqs.map((f, i) => join(silence(i * step), note(f, i === freqs.length - 1 ? last : step + 0.25, bright)))),
    0.5,
  );
}

/** Spec: a soft, neutral "boop" around 0.3 s, like a muted marimba. Never a buzzer. */
function incorrectTone() {
  return normalize(note(293.66, 0.35, { partials: [[1, 1, 0.09], [4, 0.12, 0.03]], attack: 0.005 }), 0.3);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

/** "Who eats what?" question placeholder: two notes going up, like a question. */
function questionTone() {
  return normalize(join(note(440, 0.14, bright), silence(0.04), note(587.33, 0.26, bright)), 0.4);
}

/** "Yum!" placeholder: three quick low chomps. */
function yumTone() {
  const chomp = (f) => note(f, 0.09, { partials: [[1, 1, 0.05], [2, 0.4, 0.03]], attack: 0.004 });
  return normalize(join(chomp(220), silence(0.06), chomp(208), silence(0.06), chomp(196)), 0.45);
}

function feedbackTone(assetPath) {
  if (/yum/.test(assetPath)) return yumTone();
  if (/question/.test(assetPath)) return questionTone();
  if (/incorrect/.test(assetPath)) return incorrectTone();
  if (/session_end/.test(assetPath)) return arpeggio([C5, E5, G5, C6], 0.15, 0.7);
  const variant = Number(/_(\d+)\.\w+$/.exec(assetPath)?.[1] ?? 1);
  return arpeggio([C5, E5, G5].map((f) => semitone(f, variant - 1)), 0.1, 0.35);
}

// ---- main -------------------------------------------------------------------------------------

function write(assetPath, contents) {
  const rel = placeholderPath(assetPath);
  if (!rel) return 0;
  const file = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return 1;
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
let count = 0;
const packIds = fs.existsSync(PACKS_DIR)
  ? fs.readdirSync(PACKS_DIR).filter((d) => fs.existsSync(path.join(PACKS_DIR, d, 'manifest.json')))
  : [];

for (const packId of packIds) {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, packId, 'manifest.json'), 'utf8'));
  manifest.items.forEach((item, index) => {
    const pictures = [...(item.images ?? []), ...(item.image ? [item.image] : [])];
    for (const p of pictures) count += write(`packs/${p}`, pictureSvg(item));
    // Things without a sound (name-only items) get no sound placeholder.
    if (item.sound) count += write(`packs/${item.sound}`, wav(animalTone(index % 24)));
    for (const lang of ['en', 'ar']) {
      if (item.name_audio?.[lang]) count += write(`packs/${item.name_audio[lang]}`, wav(nameTone(index, lang)));
    }
  });
  const fb = manifest.feedback_audio;
  if (fb) {
    const feedbackPaths = [
      ...fb.correct.en,
      ...fb.correct.ar,
      fb.incorrect_tone,
      fb.session_end.en,
      fb.session_end.ar,
      ...Object.values(fb.odd_question ?? {}),
    ];
    for (const p of feedbackPaths) count += write(p, wav(feedbackTone(p)));
  }
  // "Who eats what?": the question after the animal's name, and the "yum".
  const assoc = manifest.association;
  if (assoc) {
    const paths = [
      ...Object.values(assoc.question_audio ?? {}),
      ...Object.values(assoc.question_audio_feminine ?? {}),
      assoc.reward_audio,
    ].filter(Boolean);
    for (const p of paths) count += write(p, wav(feedbackTone(p)));
  }
}

console.log(`[placeholders] ${count} files in ${path.relative(ROOT, OUT_DIR)} for packs: ${packIds.join(', ') || 'none'}`);
