import { useMemo, type CSSProperties } from 'react';

const CONFETTI_COLORS = ['#FFB703', '#FB8500', '#8ECAE6', '#219EBC', '#90BE6D', '#F28482', '#CDB4DB'];

/** Spec 6.5: a simple celebration at the end of a game. Pictures and motion only, no text. */
export function SessionEndScene() {
  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.2 + Math.random() * 1.4,
        rot: Math.round(Math.random() * 720 - 360),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  const balloons = ['🎈', '⭐', '🎈', '🌟', '🎈'];
  return (
    <div className="scene session-end" aria-hidden="true">
      {confetti.map((c, i) => (
        <i
          key={i}
          className="fall"
          style={
            {
              left: `${c.left}%`,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              '--rot': `${c.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
      <div className="balloons">
        {balloons.map((b, i) => (
          <span key={i} className="balloon" style={{ animationDelay: `${i * 0.18}s` }}>
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

/** After the game: a calm scene that waits for a parent (only the corner circle works here). */
export function IdleScene() {
  return (
    <div className="scene idle" aria-hidden="true">
      <span className="moon">🌙</span>
      <span className="twinkle t1">✨</span>
      <span className="twinkle t2">⭐</span>
      <span className="twinkle t3">✨</span>
    </div>
  );
}
