import { useEffect, useState } from 'react';
import {
  automaticVoice,
  cancelSpeech,
  chooseVoice,
  chosenVoiceUri,
  localVoices,
  onVoicesChanged,
  speak,
  speechSupported,
} from '../../audio/speech';
import type { Lang } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import type { StringKey } from '../../i18n/strings';

/** What the Test button says: a word and a question, like the game. */
const SAMPLE: Record<Lang, string> = { ar: 'مرحباً! أين القطة؟', en: 'Hello! Where is the cat?' };

type Platform = 'android' | 'ios' | 'windows' | 'mac';
const INSTALL: Record<Platform, StringKey> = {
  android: 'voiceInstallAndroid',
  ios: 'voiceInstallIos',
  windows: 'voiceInstallWindows',
  mac: 'voiceInstallMac',
};

/** This phone's system, to show only its install steps. All of them when it can't be told. */
function platform(): Platform | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPads say they are Macs; a Mac has no touch screen.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh/i.test(ua)) return 'mac';
  return null;
}

/**
 * Voices on this phone: which voice reads the Arabic and English words while the recordings are
 * placeholders, a choice among the phone's own voices, a test, and how to add a missing language.
 */
export function VoicesCard() {
  const { t } = useI18n();
  const [, redraw] = useState(0);
  // The phone lists its voices late, and again after one is installed.
  useEffect(() => onVoicesChanged(() => redraw((n) => n + 1)), []);
  useEffect(() => () => cancelSpeech(), []);

  return (
    <section className="card">
      <h2>{t('voicesTitle')}</h2>
      {speechSupported() ? (
        (['ar', 'en'] as const).map((lang) => <VoiceRow key={lang} lang={lang} onChange={() => redraw((n) => n + 1)} />)
      ) : (
        <p className="note">{t('voiceNoSpeech')}</p>
      )}
      <p className="hint">{t('voicesHint')}</p>
    </section>
  );
}

function VoiceRow({ lang, onChange }: { lang: Lang; onChange: () => void }) {
  const { t } = useI18n();
  const name = t(lang === 'ar' ? 'voiceLangAr' : 'voiceLangEn');
  const voices = localVoices(lang);

  if (!voices.length) {
    const here = platform();
    const steps = (Object.keys(INSTALL) as Platform[]).filter((p) => !here || p === here);
    return (
      <div className="row voice-missing">
        <div className="row-text">
          <span className="row-label">{name}</span>
          <p className="note">{t('voiceNone', { lang: name })}</p>
          <ul className="voice-steps">
            {steps.map((p) => (
              <li key={p}>{t(INSTALL[p], { lang: name })}</li>
            ))}
          </ul>
          <span className="hint">{t('voiceAfterInstall')}</span>
        </div>
      </div>
    );
  }

  const chosen = chosenVoiceUri(lang);
  const value = chosen && voices.some((v) => v.voiceURI === chosen) ? chosen : '';
  // Voice names are long ("Microsoft Naayf - Arabic (Saudi)"): the picker gets its own full line.
  return (
    <div className="row">
      <div className="row-text">
        <span className="row-label">{name}</span>
      </div>
      <div className="voice-pick">
        <select
          className="voice-select"
          aria-label={name}
          value={value}
          onChange={(e) => {
            chooseVoice(lang, e.target.value || null);
            onChange();
          }}
        >
          <option value="">{t('voiceAuto', { name: automaticVoice(lang)?.name ?? '' })}</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => {
            cancelSpeech();
            void speak(SAMPLE[lang], lang, () => false);
          }}
        >
          ▶ {t('voiceTest')}
        </button>
      </div>
    </div>
  );
}
