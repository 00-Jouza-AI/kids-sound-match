import { useEffect, useRef, useState, type PointerEvent } from 'react';

export const HOLD_MS = 3000;

/**
 * Spec 6.2: a small, low-contrast circle in a top corner. Only a continuous 3-second press opens
 * the parent gate; taps and shorter holds do nothing. A ring fills while holding.
 */
export function GateButton({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const pointer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    pointer.current = null;
    setHolding(false);
  };

  useEffect(() => cancel, []);

  const start = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture isn't essential.
    }
    setHolding(true);
    timer.current = window.setTimeout(() => {
      cancel();
      onUnlock();
    }, HOLD_MS);
  };

  const end = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId === pointer.current) cancel();
  };

  return (
    <button
      type="button"
      className={holding ? 'gate holding' : 'gate'}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" />
      </svg>
      <span className="gate-dot" />
    </button>
  );
}
