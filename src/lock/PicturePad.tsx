import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { Overlay } from '../ui/parent/components';
import {
  createPictureCode,
  LOCK_PICTURES,
  loadPictureCode,
  PICTURE_CODE_LENGTH,
  savePictureCode,
  verifyPictureCode,
} from './lockPrefs';
import { afterAttempt, loadGuard, lockRemainingMs, saveGuard } from './pin';

const pictureUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;

/**
 * 9 big pictures; tap 4 in order. There is no delete key: after the 4th tap the pad checks and
 * clears itself, so a wrong try just starts again. While unlocking, the taps show as dots only.
 */
function PicturePad({
  title,
  subtitle,
  message,
  disabled,
  showChoices,
  onComplete,
  footer,
}: {
  title: string;
  subtitle?: string;
  message?: string;
  disabled?: boolean;
  /** Setting up a code: show the pictures chosen so far (unlocking shows dots instead). */
  showChoices?: boolean;
  onComplete: (positions: number[]) => void;
  footer?: ReactNode;
}) {
  const { lang } = useI18n();
  const [taps, setTaps] = useState<number[]>([]);
  const tapsRef = useRef(taps);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const press = (position: number) => {
    const current = tapsRef.current;
    if (disabled || current.length >= PICTURE_CODE_LENGTH) return;
    const next = [...current, position];
    tapsRef.current = next;
    setTaps(next);
    if (next.length === PICTURE_CODE_LENGTH) {
      // Let the last dot fill in before checking.
      window.setTimeout(() => {
        tapsRef.current = [];
        setTaps([]);
        completeRef.current(next);
      }, 200);
    }
  };

  return (
    <div className="picture-pad">
      <h2>{title}</h2>
      {subtitle && <p className="hint">{subtitle}</p>}
      <div className="pin-dots picture-dots" aria-live="polite" aria-label={`${taps.length} / ${PICTURE_CODE_LENGTH}`}>
        {Array.from({ length: PICTURE_CODE_LENGTH }, (_, i) =>
          showChoices && taps[i] !== undefined ? (
            <img key={i} className="dot chosen" src={pictureUrl(LOCK_PICTURES[taps[i]].path)} alt="" />
          ) : (
            <span key={i} className={i < taps.length ? 'dot filled' : 'dot'} />
          ),
        )}
      </div>
      <p className="msg error" role="alert">
        {message ?? ''}
      </p>
      <div className="picture-keys" dir="ltr">
        {LOCK_PICTURES.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className="picture-key"
            aria-label={p.name[lang]}
            disabled={disabled}
            onClick={() => press(i)}
          >
            <img src={pictureUrl(p.path)} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {footer && <div className="pin-footer">{footer}</div>}
    </div>
  );
}

/**
 * Leaving a game with the picture lock. 3 wrong tries start the same 30-second wait as the PIN
 * (they share the count). "Use the PIN" is always there, for a forgotten picture code.
 */
export function PictureGate({ onSuccess, onCancel, onUsePin }: { onSuccess: () => void; onCancel: () => void; onUsePin: () => void }) {
  const { t } = useI18n();
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

  const check = async (positions: number[]) => {
    const record = loadPictureCode();
    if (!record) {
      onUsePin();
      return;
    }
    setBusy(true);
    const ok = await verifyPictureCode(positions, record);
    setBusy(false);
    const next = afterAttempt(loadGuard(), ok, Date.now());
    saveGuard(next);
    setGuard(next);
    setNow(Date.now());
    if (ok) onSuccess();
    else setWrong(true);
  };

  const message = remaining > 0 ? t('gateCooldown', { s: Math.ceil(remaining / 1000) }) : wrong ? t('pictureWrong') : undefined;
  return (
    <Overlay label={t('gateTitle')} onDismiss={onCancel}>
      <PicturePad
        title={t('pictureEnter')}
        subtitle={t('gateTitle')}
        message={message}
        disabled={remaining > 0 || busy}
        onComplete={(p) => void check(p)}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={onCancel}>
              {t('cancel')}
            </button>
            <button type="button" className="btn ghost" onClick={onUsePin}>
              {t('pictureUsePin')}
            </button>
          </>
        }
      />
    </Overlay>
  );
}

/** Choose 4 pictures, then tap the same 4 again. Settings only (it's already behind the PIN). */
export function PictureSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [first, setFirst] = useState<number[] | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const complete = async (positions: number[]) => {
    if (first === null) {
      setFirst(positions);
      setMismatch(false);
      return;
    }
    if (positions.join() !== first.join()) {
      setFirst(null);
      setMismatch(true);
      return;
    }
    savePictureCode(await createPictureCode(positions));
    onDone();
  };

  return (
    <Overlay label={t('pictureSetupTitle')} onDismiss={onCancel}>
      <PicturePad
        title={t('pictureSetupTitle')}
        subtitle={first === null ? t('pictureChoose') : t('pictureAgain')}
        message={mismatch ? t('pictureMismatch') : undefined}
        showChoices
        onComplete={(p) => void complete(p)}
        footer={
          <button type="button" className="btn ghost" onClick={onCancel}>
            {t('cancel')}
          </button>
        }
      />
    </Overlay>
  );
}
