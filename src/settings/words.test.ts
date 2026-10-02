import { describe, expect, it } from 'vitest';
import { addExtraWord, removeExtraWord, sanitizeWordMarks, toggleSays, type WordMarks } from './words';

const empty: WordMarks = { says: {}, extra: [] };

describe('the words a child says', () => {
  it('marks and unmarks a word, with the day it was marked', () => {
    const marked = toggleSays(empty, 'animals/cat', 1000);
    expect(marked.says).toEqual({ 'animals/cat': 1000 });
    expect(toggleSays(marked, 'animals/cat', 2000).says).toEqual({});
  });

  it('adds words outside the app once, tidied, and removes them', () => {
    let marks = addExtraWord(empty, '  bye   bye ', 5);
    marks = addExtraWord(marks, 'Bye Bye', 6);
    marks = addExtraWord(marks, '   ', 7);
    marks = addExtraWord(marks, 'ماء', 8);
    expect(marks.extra.map((e) => e.text)).toEqual(['bye bye', 'ماء']);
    expect(removeExtraWord(marks, marks.extra[0].id).extra.map((e) => e.text)).toEqual(['ماء']);
  });

  it('repairs whatever was stored', () => {
    expect(sanitizeWordMarks(null)).toEqual(empty);
    expect(
      sanitizeWordMarks({ says: { 'animals/cat': 3, bad: 'x' }, extra: [{ id: 'a', text: 'hi', at: 1 }, { text: 'no id' }] }),
    ).toEqual({ says: { 'animals/cat': 3 }, extra: [{ id: 'a', text: 'hi', at: 1 }] });
  });
});
