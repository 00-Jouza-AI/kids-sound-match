import type { CSSProperties } from 'react';
import type { Profile } from '../../settings/profiles';

/** A child's avatar: their animal on their colour. Never a name or photo. */
export function Avatar({ profile, size = 48 }: { profile: Profile; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ '--avatar': profile.color, width: size, height: size, fontSize: size * 0.56 } as CSSProperties}
    >
      {profile.animal}
    </span>
  );
}

/** The children, one tap to choose who's playing. */
export function ProfileRow({
  profiles,
  activeId,
  onSelect,
  label,
}: {
  profiles: readonly Profile[];
  activeId: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="profile-row" role="radiogroup" aria-label={label}>
      {profiles.map((p, i) => (
        <button
          type="button"
          key={p.id}
          role="radio"
          aria-checked={p.id === activeId}
          aria-label={`${p.animal} ${i + 1}`}
          className={p.id === activeId ? 'profile on' : 'profile'}
          style={{ '--avatar': p.color } as CSSProperties}
          onClick={() => onSelect(p.id)}
        >
          <Avatar profile={p} />
        </button>
      ))}
    </div>
  );
}
