import { useState } from 'react';
import { useI18n } from '../../i18n/I18n';
import { PinSetup } from '../../lock/PinSetup';
import type { Settings } from '../../settings/settings';
import { Segmented } from './components';

const STEPS = 4;

/** Spec 5.1: what the app does, how Child Lock works (honestly), the privacy promise, then a PIN. */
export function FirstRun({
  update,
  onDone,
}: {
  update: (patch: Partial<Settings>) => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));

  return (
    <div className="parent first-run">
      <div className="first-run-top">
        <span className="step-count">{t('stepOf', { n: step + 1, total: STEPS })}</span>
        {step === 0 && (
          <Segmented
            label={t('settingsAppLanguage')}
            value={lang}
            options={[
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(v) => update({ uiLanguageOverride: v })}
          />
        )}
      </div>

      {step === 0 && (
        <section className="intro">
          <img className="intro-art" src="icon.svg" alt="" />
          <h1>{t('firstRunWelcomeTitle')}</h1>
          <p>{t('firstRunWelcomeBody')}</p>
        </section>
      )}

      {step === 1 && (
        <section className="intro">
          <div className="intro-art lock-art" aria-hidden="true">
            <span className="gate demo">
              <svg className="ring" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" />
              </svg>
              <span className="gate-dot" />
            </span>
          </div>
          <h1>{t('firstRunLockTitle')}</h1>
          <p>{t('firstRunLockBody')}</p>
          <p className="callout">{t('firstRunLockTip')}</p>
          <p>{t('firstRunLockExit')}</p>
        </section>
      )}

      {step === 2 && (
        <section className="intro">
          <div className="intro-art promise-art" aria-hidden="true">🔒</div>
          <h1>{t('firstRunPrivacyTitle')}</h1>
          <ul className="promise">
            <li>{t('privacyNoAds')}</li>
            <li>{t('privacyNoAccount')}</li>
            <li>{t('privacyLocal')}</li>
            <li>{t('privacyOwn')}</li>
          </ul>
        </section>
      )}

      {step === 3 && (
        <section className="intro">
          <h1>{t('firstRunPinTitle')}</h1>
          <p>{t('firstRunPinBody')}</p>
          <PinSetup onDone={onDone} />
        </section>
      )}

      {step < STEPS - 1 && (
        <div className="first-run-actions">
          {step > 0 && (
            <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
              {t('back')}
            </button>
          )}
          <button type="button" className="btn primary wide" onClick={next}>
            {t('continue')}
          </button>
        </div>
      )}
    </div>
  );
}
