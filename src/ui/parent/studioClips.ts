import { FEEDBACK_SPEECH } from '../../audio/clips';
import type { LoadedItem, LoadedPack, ResolvedAsset } from '../../content/types';

/** Everything the recording studio can record: names, sounds and the game's lines. */
export interface StudioClip {
  /** The manifest path it fills, e.g. "packs/animals/cat_name_ar.mp3". */
  path: string;
  /** The pack it belongs to, or LINES for praise and questions. */
  packId: string;
  kind: 'ar' | 'en' | 'sound';
  /** What to say (or, for a sound, what it is). */
  say: string;
  item?: LoadedItem;
  /** Already a real recording, not a stand-in. */
  real: boolean;
}

export const LINES = 'lines';

/**
 * Every clip, each file once (the carrot's name is shared by Food and Who eats what?). The boys'
 * Arabic "Where's your…?" lines (أين أنفُكَ؟) are only listed when a child is a boy.
 */
export function studioClips(packs: readonly LoadedPack[], { boys = false }: { boys?: boolean } = {}): StudioClip[] {
  const seen = new Set<string>();
  const out: StudioClip[] = [];
  const add = (asset: ResolvedAsset | null, clip: Omit<StudioClip, 'path' | 'real'>) => {
    if (!asset || seen.has(asset.path)) return;
    seen.add(asset.path);
    out.push({ ...clip, path: asset.path, real: asset.real });
  };
  for (const p of packs) {
    for (const i of p.items) {
      add(i.nameAudio.ar, { packId: p.id, kind: 'ar', say: i.name.ar, item: i });
      add(i.nameAudio.en, { packId: p.id, kind: 'en', say: i.name.en, item: i });
      add(i.sound, { packId: p.id, kind: 'sound', say: i.name.en, item: i });
    }
    // "Where's your nose?" (body parts), after the names.
    for (const i of p.items) {
      const point = i.point;
      if (!point) continue;
      if (point.ar_f) add(point.ar_f.audio, { packId: p.id, kind: 'ar', say: point.ar_f.text, item: i });
      if (point.ar_m && boys) add(point.ar_m.audio, { packId: p.id, kind: 'ar', say: point.ar_m.text, item: i });
      if (point.en) add(point.en.audio, { packId: p.id, kind: 'en', say: point.en.text, item: i });
    }
  }
  const line = (asset: ResolvedAsset | null, kind: StudioClip['kind'], say?: string) =>
    add(asset, { packId: LINES, kind, say: say ?? (asset ? (FEEDBACK_SPEECH[asset.path] ?? asset.path) : '') });
  const fb = packs[0]?.feedback;
  if (fb) {
    for (const lang of ['ar', 'en'] as const) {
      fb.correct[lang].forEach((a) => line(a, lang));
      line(fb.sessionEnd[lang], lang);
    }
    line(fb.incorrectTone, 'sound', 'Soft "try again" tone');
    if (fb.oddQuestion) for (const lang of ['ar', 'en'] as const) line(fb.oddQuestion[lang], lang);
    if (fb.peekaboo) for (const lang of ['ar', 'en'] as const) line(fb.peekaboo[lang], lang);
  }
  for (const p of packs) {
    const a = p.association;
    if (!a) continue;
    line(a.question.ar, 'ar');
    line(a.questionFeminine.ar, 'ar');
    line(a.question.en, 'en');
    line(a.reward, 'sound', 'Yum!');
  }
  return out;
}

/** Where a studio recording is saved: next to the manifest's file, as WAV. */
export function studioSavePath(manifestPath: string): string {
  return manifestPath.replace(/\.[a-z0-9]+$/i, '.wav');
}
