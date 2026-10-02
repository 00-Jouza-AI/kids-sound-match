import { newId } from '../custom/types';
import { profileKey } from './profiles';
import { local } from './storage';

/**
 * The words a parent marked as said ("she says it!"), and the words outside the app they added
 * ("bye-bye", "ماء"). Per child, kept on this phone only, never backed up.
 */
export interface WordMarks {
  /** Word id (see report/words wordId) -> when it was marked. */
  says: Record<string, number>;
  extra: ExtraWord[];
}

export interface ExtraWord {
  id: string;
  text: string;
  at: number;
}

const KEY = 'ksm.words.v1';
const MAX_TEXT = 40;

export function sanitizeWordMarks(raw: unknown): WordMarks {
  const r = raw && typeof raw === 'object' ? (raw as Partial<WordMarks>) : {};
  const says: Record<string, number> = {};
  if (r.says && typeof r.says === 'object') {
    for (const [word, at] of Object.entries(r.says)) if (typeof at === 'number') says[word] = at;
  }
  const extra = (Array.isArray(r.extra) ? r.extra : []).filter(
    (e): e is ExtraWord => e && typeof e.id === 'string' && typeof e.text === 'string' && typeof e.at === 'number',
  );
  return { says, extra };
}

export function loadWordMarks(profileId: string): WordMarks {
  return sanitizeWordMarks(local.getJson(profileKey(KEY, profileId)));
}

export function saveWordMarks(profileId: string, marks: WordMarks): void {
  local.setJson(profileKey(KEY, profileId), marks);
}

export function forgetWordMarks(profileId: string): void {
  local.remove(profileKey(KEY, profileId));
}

/** Says it / doesn't say it yet. */
export function toggleSays(marks: WordMarks, word: string, now = Date.now()): WordMarks {
  const says = { ...marks.says };
  if (says[word] !== undefined) delete says[word];
  else says[word] = now;
  return { ...marks, says };
}

/** A word the app doesn't have. Blank text, or one already on the list, changes nothing. */
export function addExtraWord(marks: WordMarks, text: string, now = Date.now()): WordMarks {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT);
  if (!clean || marks.extra.some((e) => e.text.toLocaleLowerCase() === clean.toLocaleLowerCase())) return marks;
  return { ...marks, extra: [...marks.extra, { id: newId(), text: clean, at: now }] };
}

export function removeExtraWord(marks: WordMarks, id: string): WordMarks {
  return { ...marks, extra: marks.extra.filter((e) => e.id !== id) };
}
