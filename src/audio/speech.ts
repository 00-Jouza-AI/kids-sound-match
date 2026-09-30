import type { Lang } from '../content/types';

// The phone's own text-to-speech stands in for the voice recordings until they exist
// (development and test builds only). Only on-device voices are used: network voices would
// send the words to another company's server.

let voices: SpeechSynthesisVoice[] = [];
let finishCurrent: (() => void) | null = null;
let lastCancelAt = 0;

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function refreshVoices(): void {
  if (supported()) voices = window.speechSynthesis.getVoices();
}

if (supported()) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

const PREFERRED: Record<Lang, string[]> = {
  ar: ['ar-jo', 'ar-sa', 'ar-ae', 'ar-eg'],
  en: ['en-gb', 'en-us'],
};

export function localVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (!voices.length) refreshVoices();
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const matches = voices.filter((v) => v.localService && norm(v).startsWith(lang));
  for (const code of PREFERRED[lang]) {
    const v = matches.find((m) => norm(m) === code);
    if (v) return v;
  }
  return matches[0] ?? null;
}

export function speechAvailable(lang: Lang): boolean {
  return supported() && localVoice(lang) !== null;
}

/** iOS only allows speech that starts inside a tap; a silent utterance there unlocks it. */
export function unlockSpeech(): void {
  if (!supported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

export function speak(text: string, lang: Lang, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const voice = supported() ? localVoice(lang) : null;
    if (!voice || isCancelled()) {
      resolve();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(safety);
      if (finishCurrent === finish) finishCurrent = null;
      resolve();
    };
    // Some browsers never fire `end`; never let the game wait forever.
    const safety = window.setTimeout(finish, 2500 + text.length * 150);
    finishCurrent = finish;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    // Warm and a little slower, as the recording brief asks.
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.onend = finish;
    utterance.onerror = finish;

    const go = () => {
      if (isCancelled()) finish();
      else window.speechSynthesis.speak(utterance);
    };
    // Chrome drops an utterance queued right after cancel(); give it a moment.
    const sinceCancel = Date.now() - lastCancelAt;
    if (sinceCancel < 120) window.setTimeout(go, 120 - sinceCancel);
    else go();
  });
}

export function cancelSpeech(): void {
  if (!supported()) return;
  lastCancelAt = Date.now();
  window.speechSynthesis.cancel();
  finishCurrent?.();
}
