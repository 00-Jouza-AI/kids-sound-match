import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { normalizeDigits } from '../ui/parent/components';
import { PIN_LENGTH } from './pin';

interface Props {
  title: string;
  subtitle?: string;
  message?: string;
  disabled?: boolean;
  onComplete: (pin: string) => void;
  footer?: ReactNode;
}

/** Four dots and a phone-style keypad. Keypads read left to right in Arabic too. */
export function PinPad({ title, subtitle, message, disabled, onComplete, footer }: Props) {
  const { t } = useI18n();
  const [digits, setDigits] = useState('');
  const digitsRef = useRef(digits);
  digitsRef.current = digits;
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const press = (d: string) => {
    const current = digitsRef.current;
    if (disabled || current.length >= PIN_LENGTH) return;
    const next = current + d;
    digitsRef.current = next;
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      // Let the last dot fill in before checking.
      window.setTimeout(() => {
        digitsRef.current = '';
        setDigits('');
        completeRef.current(next);
      }, 150);
    }
  };

  const erase = () => {
    const next = digitsRef.current.slice(0, -1);
    digitsRef.current = next;
    setDigits(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = normalizeDigits(e.key);
      if (/^\d$/.test(key)) press(key);
      else if (e.key === 'Backspace') erase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pinpad">
      <h2>{title}</h2>
      {subtitle && <p className="hint">{subtitle}</p>}
      <div className="pin-dots" aria-live="polite" aria-label={`${digits.length} / ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < digits.length ? 'dot filled' : 'dot'} />
        ))}
      </div>
      <p className="msg error" role="alert">
        {message ?? ''}
      </p>
      <div className="keys" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" key={d} className="key" onClick={() => press(d)} disabled={disabled}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" className="key" onClick={() => press('0')} disabled={disabled}>
          0
        </button>
        <button type="button" className="key erase" onClick={erase} aria-label={t('deleteDigit')} disabled={disabled}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z M12 9l6 6 M18 9l-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {footer && <div className="pin-footer">{footer}</div>}
    </div>
  );
}
