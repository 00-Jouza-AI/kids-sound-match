import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Voice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI' | 'localService'>;
const voice = (name: string, lang: string, localService = true): Voice => ({ name, lang, voiceURI: name, localService });

/** A phone with two Arabic voices, an online Arabic voice and one English voice. */
const PHONE: Voice[] = [
  voice('Hoda', 'ar-EG'),
  voice('Naayf', 'ar_SA'),
  voice('Online Arabic', 'ar-AE', false),
  voice('Libby', 'en-GB'),
];

let speech: typeof import('./speech');

beforeAll(async () => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    speechSynthesis: { getVoices: () => PHONE, addEventListener: () => undefined },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  speech = await import('./speech');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('the stand-in voice', () => {
  it('only uses voices stored on the phone', () => {
    expect(speech.localVoices('ar').map((v) => v.name)).toEqual(['Hoda', 'Naayf']);
    expect(speech.localVoices('en').map((v) => v.name)).toEqual(['Libby']);
  });

  it('picks a Gulf Arabic voice by itself, and the parent can choose another', () => {
    expect(speech.localVoice('ar')?.name).toBe('Naayf');
    speech.chooseVoice('ar', 'Hoda');
    expect(speech.localVoice('ar')?.name).toBe('Hoda');
    expect(speech.localVoice('en')?.name).toBe('Libby');
    speech.chooseVoice('ar', null);
    expect(speech.localVoice('ar')?.name).toBe('Naayf');
  });

  it('goes back to the automatic voice when the chosen one is gone or online', () => {
    speech.chooseVoice('ar', 'Online Arabic');
    expect(speech.localVoice('ar')?.name).toBe('Naayf');
    speech.chooseVoice('ar', 'Deleted voice');
    expect(speech.localVoice('ar')?.name).toBe('Naayf');
  });
});
