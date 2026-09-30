import { useMemo, useRef, type CSSProperties } from 'react';
import { fitSquares, layoutRows, useBoxSize } from './layout';

interface Props {
  options: readonly string[];
  pictures: Readonly<Record<string, string>>;
  faded: readonly string[];
  celebratedKey: string | null;
  /** Gentle hint: this picture wiggles. The pulse number restarts the wiggle each time. */
  hint: { key: string; pulse: number } | null;
  onTap: (key: string) => void;
}

export function OptionGrid({ options, pictures, faded, celebratedKey, hint, onTap }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoxSize(ref);
  const rows = layoutRows(options.length, box.w > box.h ? 'landscape' : 'portrait');
  const { size, gap } = fitSquares(box, rows);

  return (
    <div className="kid-grid" ref={ref} style={{ gap }}>
      {size > 0 &&
        rows.map((row, r) => (
          <div className="kid-row" key={r} style={{ gap }}>
            {row.map((i) => {
              const key = options[i];
              let state = '';
              if (celebratedKey === key) state = ' celebrate';
              else if (faded.includes(key)) state = ' faded';
              else if (celebratedKey) state = ' resting';
              else if (hint?.key === key) state = hint.pulse % 2 ? ' hint-a' : ' hint-b';
              return (
                <button
                  type="button"
                  key={key}
                  className={`option${state}`}
                  style={{ width: size, height: size }}
                  data-key={key}
                  tabIndex={-1}
                  aria-hidden="true"
                  onPointerDown={() => onTap(key)}
                >
                  <img src={pictures[key]} alt="" draggable={false} />
                  {celebratedKey === key && <Burst size={size} />}
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}

const BURST_COLORS = ['#FFB703', '#FB8500', '#8ECAE6', '#219EBC', '#90BE6D', '#F28482', '#CDB4DB'];

/** A little confetti pop around the right picture. No text, no score. */
export function Burst({ size }: { size: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.35;
        const distance = size * (0.55 + Math.random() * 0.25);
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          rot: Math.round(Math.random() * 540 - 270),
          color: BURST_COLORS[i % BURST_COLORS.length],
          delay: Math.round(Math.random() * 90),
          round: i % 3 === 0,
        };
      }),
    [size],
  );
  return (
    <span className="burst" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          className={p.round ? 'round' : undefined}
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
              background: p.color,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
