export function SpeakerIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={direction === 'left' ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M9 4.5l7.5 7.5L9 19.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Home screen's Explore button. */
export function ExploreIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M15 15l5 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Two cards, one face up. */
export function MemoryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="5" width="9" height="13" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="12.5" y="5" width="9" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="11.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Three circles and one triangle. */
export function OddIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6.5" cy="7" r="3.2" fill="currentColor" />
      <circle cx="17.5" cy="7" r="3.2" fill="currentColor" />
      <circle cx="6.5" cy="17.5" r="3.2" fill="currentColor" />
      <path d="M17.5 13.6l3.8 6.6h-7.6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
