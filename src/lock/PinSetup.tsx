import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { createPinRecord, saveGuard, savePinRecord } from './pin';
import { PinPad } from './PinPad';

/** Choose a PIN, then enter it again. Used by first run, Change PIN and Forgot PIN. */
export function PinSetup({ title, onDone, footer }: { title?: string; onDone: () => void; footer?: ReactNode }) {
  const { t } = useI18n();
  const [first, setFirst] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const onComplete = async (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setMismatch(false);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setMismatch(true);
      return;
    }
    savePinRecord(await createPinRecord(pin));
    saveGuard({ failures: 0, lockedUntil: 0 });
    onDone();
  };

  return (
    <PinPad
      title={title ?? (first === null ? t('pinEnterNew') : t('pinEnterAgain'))}
      subtitle={title ? (first === null ? t('pinEnterNew') : t('pinEnterAgain')) : undefined}
      message={mismatch ? t('pinMismatch') : undefined}
      onComplete={(pin) => void onComplete(pin)}
      footer={footer}
    />
  );
}
