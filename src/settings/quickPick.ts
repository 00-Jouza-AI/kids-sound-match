import type { LoadedPack } from '../content/types';
import { MIN_ITEMS_PER_PACK } from '../content/validate';
import { effectiveMode, usableInMode, type Settings } from './settings';

/**
 * The end screen's quick picker: choose the pack and one of its groups (Farm animals, Fruit...)
 * without going through Settings. What it changes is saved like Settings, for this child.
 */

/** What a pack is playing now: 'all' (the default selection), a group's id, or null for a hand-picked mix. */
export function activeGroup(pack: LoadedPack, settings: Settings): string | null {
  const chosen = settings.enabledItems[pack.id];
  if (!chosen) return 'all';
  const set = new Set(chosen);
  return pack.groups.find((g) => g.items.length === set.size && g.items.every((k) => set.has(k)))?.id ?? null;
}

/** A group can be played when it has at least 5 pictures for what the child hears. */
export function groupPlayable(pack: LoadedPack, items: readonly string[], settings: Settings): boolean {
  const mode = effectiveMode(pack, settings.mode);
  return pack.items.filter((i) => items.includes(i.key) && usableInMode(i, mode)).length >= MIN_ITEMS_PER_PACK;
}

/**
 * The settings change for playing a pack: all of it, one group, or (group null: not touched) the
 * pictures already chosen for it in Settings.
 */
export function pickPatch(settings: Settings, pack: LoadedPack, group: string | null): Partial<Settings> {
  if (group === null) return { packId: pack.id };
  const enabledItems = { ...settings.enabledItems };
  if (group === 'all') delete enabledItems[pack.id];
  else enabledItems[pack.id] = [...(pack.groups.find((g) => g.id === group)?.items ?? [])];
  return { packId: pack.id, enabledItems };
}
