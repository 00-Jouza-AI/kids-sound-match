import type { ArGender } from '../content/types';
import { newId } from '../custom/types';
import { local } from './storage';

/**
 * One child. Shown as an animal on a colour, never a name or photo, so the privacy promise holds:
 * no child name, age or photo, ever. Each child has their own settings, Report, practice and
 * daily play-again count; the PIN, My packs and the parent's voice are shared.
 */
export interface Profile {
  id: string;
  animal: string;
  color: string;
  /** Girl or boy, only for Arabic grammar ("Where's your nose?": أنفُكِ / أنفُكَ). Unset until a parent says. */
  arGender?: ArGender;
}

export interface ProfileState {
  profiles: Profile[];
  activeId: string;
}

/** The first child. Also owns the settings and results saved before profiles existed. */
export const FIRST_PROFILE_ID = 'first';
export const MAX_PROFILES = 4;
export const PROFILE_ANIMALS = ['🦁', '🐰', '🐻', '🐱', '🐶', '🐼', '🦊', '🐸', '🐵', '🐧'] as const;
export const PROFILE_COLORS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#4d96ff', '#9b5de5'] as const;

const KEY = 'ksm.profiles.v1';

export function defaultProfiles(): ProfileState {
  return { profiles: [{ id: FIRST_PROFILE_ID, animal: PROFILE_ANIMALS[0], color: PROFILE_COLORS[0] }], activeId: FIRST_PROFILE_ID };
}

/** Repairs whatever was stored, so a damaged value never breaks the app. */
export function sanitizeProfiles(raw: unknown): ProfileState {
  if (!raw || typeof raw !== 'object') return defaultProfiles();
  const r = raw as { profiles?: unknown; activeId?: unknown };
  const seen = new Set<string>();
  const profiles = (Array.isArray(r.profiles) ? r.profiles : [])
    .filter((p): p is Profile => {
      const ok = p && typeof p.id === 'string' && p.id && typeof p.animal === 'string' && typeof p.color === 'string' && !seen.has(p.id);
      if (ok) seen.add(p.id);
      return Boolean(ok);
    })
    .slice(0, MAX_PROFILES)
    .map((p) => ({
      id: p.id,
      animal: p.animal,
      color: p.color,
      ...(p.arGender === 'f' || p.arGender === 'm' ? { arGender: p.arGender } : {}),
    }));
  if (!profiles.length) return defaultProfiles();
  const activeId = profiles.some((p) => p.id === r.activeId) ? (r.activeId as string) : profiles[0].id;
  return { profiles, activeId };
}

export function loadProfiles(): ProfileState {
  return sanitizeProfiles(local.getJson(KEY));
}

export function saveProfiles(state: ProfileState): void {
  local.setJson(KEY, state);
}

/** A new child, with an animal and a colour no other child has yet. */
export function newProfile(existing: readonly Profile[]): Profile {
  const animal = PROFILE_ANIMALS.find((a) => !existing.some((p) => p.animal === a)) ?? PROFILE_ANIMALS[0];
  const color = PROFILE_COLORS.find((c) => !existing.some((p) => p.color === c)) ?? PROFILE_COLORS[0];
  return { id: newId(), animal, color };
}

/** The child a saved game belongs to. Games saved before profiles existed belong to the first child. */
export function sessionProfile(session: { profileId?: string }): string {
  return session.profileId ?? FIRST_PROFILE_ID;
}

/** Only this child's games. */
export function forProfile<T extends { profileId?: string }>(sessions: readonly T[], profileId: string): T[] {
  return sessions.filter((s) => sessionProfile(s) === profileId);
}

/** Per-child storage keys. The first child keeps the keys used before profiles existed. */
export function profileKey(base: string, profileId: string): string {
  return profileId === FIRST_PROFILE_ID ? base : `${base}.${profileId}`;
}
