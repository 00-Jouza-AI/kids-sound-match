import type { Lang } from '../content/types';
import { local } from '../settings/storage';

// The phone's own text-to-speech stands in for the voice recordings until they exist
// (development and test builds only). Only on-device voices are used: network voices would
// send the words to another company's server.

let voices: SpeechSynthesisVoice[] = [];
let finishCurrent: (() => void) | null = null;
let lastCancelAt = 0;
const listeners = new Set<() => void>();

/** The voice a parent chose in Settings for each language (its voiceURI). For the whole phone. */
const CHOSEN_KEY = 'ksm.voices.v1';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
const supported = speechSupported;

function refreshVoices(): void {
  if (supported()) voices = window.speechSynthesis.getVoices();
}

if (supported()) {
  refreshVoices();
  // Phones often list their voices a moment after the page opens.
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    refreshVoices();
    listeners.forEach((l) => l());
  });
}

/** Called when the phone's list of voices changes (it often arrives late). */
export function onVoicesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const PREFERRED: Record<Lang, string[]> = {
  ar: ['ar-jo', 'ar-sa', 'ar-ae', 'ar-eg'],
  en: ['en-gb', 'en-us'],
};

const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace(/_/g, '-');

/** The voices on this phone for a language. Online voices are left out: they would send the words away. */
export function localVoices(lang: Lang): SpeechSynthesisVoice[] {
  if (!voices.length) refreshVoices();
  return voices.filter((v) => v.localService && norm(v).split('-')[0] === lang);
}

/** The voice the app picks by itself: a Levantine or Gulf Arabic first, British English first. */
export function automaticVoice(lang: Lang): SpeechSynthesisVoice | null {
  const matches = localVoices(lang);
  for (const code of PREFERRED[lang]) {
    const v = matches.find((m) => norm(m) === code);
    if (v) return v;
  }
  return matches[0] ?? null;
}

export function chosenVoiceUri(lang: Lang): string | null {
  const uri = local.getJson<Partial<Record<Lang, string>>>(CHOSEN_KEY)?.[lang];
  return typeof uri === 'string' ? uri : null;
}

/** null goes back to the automatic choice. */
export function chooseVoice(lang: Lang, uri: string | null): void {
  const chosen = { ...(local.getJson<Partial<Record<Lang, string>>>(CHOSEN_KEY) ?? {}) };
  if (uri) chosen[lang] = uri;
  else delete chosen[lang];
  local.setJson(CHOSEN_KEY, chosen);
}

/** The voice that will speak: the parent's choice while it's still on the phone, else the automatic one. */
export function localVoice(lang: Lang): SpeechSynthesisVoice | null {
  const uri = chosenVoiceUri(lang);
  return (uri && localVoices(lang).find((v) => v.voiceURI === uri)) || automaticVoice(lang);
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
