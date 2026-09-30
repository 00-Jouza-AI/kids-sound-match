import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { normalizeDigits, Overlay } from '../ui/parent/components';
import { challengeNumber, numberToWords } from './numberWords';
import { afterAttempt, loadGuard, loadPinRecord, lockRemainingMs, saveGuard, verifyPin } from './pin';
import { PinPad } from './PinPad';
import { PinSetup } from './PinSetup';

interface Props {
  title?: string;
  /** "Forgot PIN?" is offered at the gate, not when changing the PIN (that needs the current one). */
  allowForgot?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'pin' | 'challenge' | 'newPin';

/**
 * Spec 6.2: the PIN pad behind every way out (leaving Kid Mode, Settings, Report, links).
 * 3 wrong PINs start a 30-second cooldown that survives a reload.
 */
export function ParentGate({ title, allowForgot = true, onSuccess, onCancel }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('pin');
  const [guard, setGuard] = useState(loadGuard);
  const [now, setNow] = useState(() => Date.now());
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const remaining = lockRemainingMs(guard, now);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [remaining > 0]);

  const check = async (pin: string) => {
    const record = loadPinRecord();
    if (!record) {
      onSuccess();
      return;
    }
    setBusy(true);
    const ok = await verifyPin(pin, record);
    setBusy(false);
    const next = afterAttempt(loadGuard(), ok, Date.now());
    saveGuard(next);
    setGuard(next);
    setNow(Date.now());
    if (ok) onSuccess();
    else setWrong(true);
  };

  const cancelButton = (
    <button type="button" className="btn ghost" onClick={onCancel}>
      {t('cancel')}
    </button>
  );

  let content;
  if (step === 'pin') {
    const message =
      remaining > 0 ? t('gateCooldown', { s: Math.ceil(remaining / 1000) }) : wrong ? t('gateWrongPin') : undefined;
    content = (
      <PinPad
        title={title ?? t('gateEnterPin')}
        subtitle={title ? undefined : t('gateTitle')}
        message={message}
        disabled={remaining > 0 || busy}
        onComplete={(pin) => void check(pin)}
        footer={
          <>
            {cancelButton}
            {allowForgot && (
              <button type="button" className="btn ghost" onClick={() => setStep('challenge')}>
                {t('forgotPin')}
              </button>
            )}
          </>
        }
      />
    );
  } else if (step === 'challenge') {
    content = <Challenge onPass={() => setStep('newPin')} cancelButton={cancelButton} />;
  } else {
    content = <PinSetup title={t('challengeTitle')} onDone={onSuccess} footer={cancelButton} />;
  }

  return (
    <Overlay label={t('gateTitle')} onDismiss={onCancel}>
      {content}
    </Overlay>
  );
}

/** Type a number that is written out in words: easy for a parent, impossible for a pre-reader. */
function Challenge({ onPass, cancelButton }: { onPass: () => void; cancelButton: ReactNode }) {
  const { t, lang } = useI18n();
  const [number, setNumber] = useState(() => challengeNumber());
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Number(value) === number) {
      onPass();
      return;
    }
    setWrong(true);
    setNumber(challengeNumber());
    setValue('');
  };

  return (
    <form className="challenge" onSubmit={submit}>
      <h2>{t('challengeTitle')}</h2>
      <p>{t('challengeBody')}</p>
      <p className="challenge-words">{numberToWords(number, lang)}</p>
      <input
        className="challenge-input"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        value={value}
        onChange={(e) => setValue(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 3))}
        aria-label={t('challengeBody')}
        autoFocus
      />
      <p className="msg error" role="alert">
        {wrong ? t('challengeWrong') : ''}
      </p>
      <div className="pin-footer">
        {cancelButton}
        <button type="submit" className="btn primary" disabled={value.length !== 3}>
          {t('challengeCheck')}
        </button>
      </div>
    </form>
  );
}
