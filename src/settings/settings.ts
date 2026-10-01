import type { LoadedItem, LoadedPack, Lang } from '../content/types';
import { MIN_ITEMS_PER_PACK } from '../content/validate';
import type { ChoiceCount } from '../engine';
import { FIRST_PROFILE_ID } from './profiles';
import { REPLAY_LIMITS } from './replays';
import { local } from './storage';

/** What the child hears as the question: the animal sound, its name, or both. */
export type GameMode = 'SOUND_AND_NAME' | 'SOUND_ONLY' | 'NAME_ONLY';
/** Language the game speaks. "both" says every name in Arabic, then English. */
export type GameLanguage = Lang | 'both';
export type UiLanguageOverride = 'system' | Lang;
export type RepeatInterval = 1 | 2 | 3;
export type QuestionsPerSession = 5 | 10 | 15;

/** Spec 5.3, plus the parent's animal selection, hints and adaptive practice. */
export interface Settings {
  packId: string;
  mode: GameMode;
  language: GameLanguage;
  choiceCount: ChoiceCount;
  repeatIntervalSec: RepeatInterval;
  questionsPerSession: QuestionsPerSession;
  toddlerMode: boolean;
  /** The right picture wiggles after ~8 s without a tap, or after two wrong taps. */
  hints: boolean;
  /** Animals the child misses come up more often, known ones less (from the local Report). */
  adaptive: boolean;
  /** Games the child can start from the end screen each day (0 = parent only, 99 = no limit). */
  replaysPerDay: number;
  telemetryEnabled: boolean;
  uiLanguageOverride: UiLanguageOverride;
  /** Per pack, the animals the parent turned on. No entry means the default selection. */
  enabledItems: Record<string, string[]>;
  /** Packs left out of the Mixed game. New packs join the mix automatically. */
  mixedExcluded: string[];
}

export const CHOICE_COUNTS = [2, 3, 4] as const;
export const REPEAT_INTERVALS = [1, 2, 3] as const;
export const QUESTIONS_PER_SESSION = [5, 10, 15] as const;
export const MODES = ['SOUND_AND_NAME', 'SOUND_ONLY', 'NAME_ONLY'] as const;
export const GAME_LANGUAGES = ['ar', 'en', 'both'] as const;
const UI_LANGUAGES = ['system', 'ar', 'en'] as const;

const STORAGE_KEY = 'ksm.settings.v1';

/** Spec 5.3: follow the device language, falling back to Arabic. */
export function deviceLanguage(languages: readonly string[]): Lang {
  for (const l of languages) {
    const lower = l.toLowerCase();
    if (lower.startsWith('ar')) return 'ar';
    if (lower.startsWith('en')) return 'en';
  }
  return 'ar';
}

export function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language];
}

/** The languages spoken, in order. "Both" is Arabic first, then English. */
export function spokenLanguages(language: GameLanguage): Lang[] {
  return language === 'both' ? ['ar', 'en'] : [language];
}

export function defaultSettings(device: Lang): Settings {
  return {
    packId: 'animals',
    mode: 'SOUND_AND_NAME',
    language: device,
    choiceCount: 3,
    repeatIntervalSec: 2,
    questionsPerSession: 10,
    toddlerMode: false,
    hints: true,
    adaptive: true,
    replaysPerDay: 3,
    telemetryEnabled: false,
    uiLanguageOverride: 'system',
    enabledItems: {},
    mixedExcluded: [],
  };
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Repairs whatever was stored, field by field, so an old or damaged value never breaks the app. */
export function sanitizeSettings(raw: unknown, device: Lang): Settings {
  const d = defaultSettings(device);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const enabledItems: Record<string, string[]> = {};
  if (r.enabledItems && typeof r.enabledItems === 'object') {
    for (const [packId, keys] of Object.entries(r.enabledItems as Record<string, unknown>)) {
      if (Array.isArray(keys)) enabledItems[packId] = keys.filter((k): k is string => typeof k === 'string');
    }
  }
  return {
    packId: typeof r.packId === 'string' && r.packId ? r.packId : d.packId,
    mode: pick(r.mode, MODES, d.mode),
    language: pick(r.language, GAME_LANGUAGES, d.language),
    choiceCount: pick(r.choiceCount, CHOICE_COUNTS, d.choiceCount),
    repeatIntervalSec: pick(r.repeatIntervalSec, REPEAT_INTERVALS, d.repeatIntervalSec),
    questionsPerSession: pick(r.questionsPerSession, QUESTIONS_PER_SESSION, d.questionsPerSession),
    toddlerMode: bool(r.toddlerMode, d.toddlerMode),
    hints: bool(r.hints, d.hints),
    adaptive: bool(r.adaptive, d.adaptive),
    replaysPerDay: pick(r.replaysPerDay, REPLAY_LIMITS as readonly number[], d.replaysPerDay),
    telemetryEnabled: bool(r.telemetryEnabled, d.telemetryEnabled),
    uiLanguageOverride: pick(r.uiLanguageOverride, UI_LANGUAGES, d.uiLanguageOverride),
    enabledItems,
    mixedExcluded: Array.isArray(r.mixedExcluded) ? r.mixedExcluded.filter((k): k is string => typeof k === 'string') : [],
  };
}

/**
 * Each child has their own settings; the app language and "Help us improve" are shared. Before
 * profiles existed every setting lived under STORAGE_KEY: the first child inherits them.
 */
export function loadSettings(profileId: string = FIRST_PROFILE_ID): Settings {
  migrateLegacySettings();
  const shared = local.getJson<Record<string, unknown>>(STORAGE_KEY) ?? {};
  const own = local.getJson<Record<string, unknown>>(childKey(profileId)) ?? {};
  return sanitizeSettings(
    { ...own, telemetryEnabled: shared.telemetryEnabled, uiLanguageOverride: shared.uiLanguageOverride },
    deviceLanguage(browserLanguages()),
  );
}

export function saveSettings(settings: Settings, profileId: string = FIRST_PROFILE_ID): void {
  migrateLegacySettings();
  const { telemetryEnabled, uiLanguageOverride, ...own } = settings;
  local.setJson(STORAGE_KEY, { telemetryEnabled, uiLanguageOverride });
  local.setJson(childKey(profileId), own);
}

/** Once: the settings saved before profiles become the first child's, before anything overwrites them. */
function migrateLegacySettings(): void {
  if (local.get(childKey(FIRST_PROFILE_ID)) !== null) return;
  const legacy = local.getJson<Record<string, unknown>>(STORAGE_KEY);
  if (!legacy || !('packId' in legacy)) return;
  const { telemetryEnabled: _telemetry, uiLanguageOverride: _language, ...own } = legacy;
  local.setJson(childKey(FIRST_PROFILE_ID), own);
}

export function forgetSettings(profileId: string): void {
  local.remove(childKey(profileId));
}

const childKey = (profileId: string) => `${STORAGE_KEY}.child.${profileId}`;

export function uiLanguage(settings: Settings): Lang {
  return settings.uiLanguageOverride === 'system' ? deviceLanguage(browserLanguages()) : settings.uiLanguageOverride;
}

/**
 * Sound modes need an animal sound; "name only" works for anything (clothes, food, family...).
 * Answers in "Who eats what?" always work: the question is the animal, not the food.
 */
export function usableInMode(item: LoadedItem, mode: GameMode): boolean {
  return mode === 'NAME_ONLY' || item.sound !== null || (item.prompts?.length ?? 0) > 0;
}

/** Default selection: the animals that have a real sound, so testing uses real sounds only. */
export function defaultSelection(pack: LoadedPack, mode: GameMode = 'SOUND_AND_NAME'): string[] {
  const usable = pack.items.filter((i) => usableInMode(i, mode));
  const withRealSound = usable.filter((i) => i.sound?.real).map((i) => i.key);
  return withRealSound.length >= MIN_ITEMS_PER_PACK ? withRealSound : usable.map((i) => i.key);
}

/**
 * The mode a pack is really played in. Packs with fewer than 5 sounds (Food, Colours, Family, a
 * parent's pack of photos) are always played by name, whatever "What your child hears" says.
 * The Mixed game keeps the setting: in sound modes, quiet pictures simply stay out of the mix.
 */
export function effectiveMode(pack: LoadedPack, mode: GameMode): GameMode {
  if (pack.parts || pack.kind === 'association') return mode;
  return pack.items.filter((i) => i.sound !== null).length >= MIN_ITEMS_PER_PACK ? mode : 'NAME_ONLY';
}

/** Whether "What your child hears" means anything for this pack. */
export function soundModesAvailable(pack: LoadedPack): boolean {
  return pack.kind !== 'association' && effectiveMode(pack, 'SOUND_ONLY') === 'SOUND_ONLY';
}

/**
 * The animals the game will use: the parent's choice if it still has enough usable animals, else the default.
 * The Mixed game uses each pack's own choice, for every pack left in the mix.
 */
export function enabledItemKeys(pack: LoadedPack, settings: Settings): string[] {
  if (pack.parts) {
    const keys = pack.parts.filter((p) => !settings.mixedExcluded.includes(p.id)).flatMap((p) => selection(p, settings.mode, settings));
    const inMix = new Set(pack.items.map((i) => i.key));
    return [...new Set(keys)].filter((k) => inMix.has(k));
  }
  return selection(pack, effectiveMode(pack, settings.mode), settings);
}

function selection(pack: LoadedPack, mode: GameMode, settings: Settings): string[] {
  const usable = pack.items.filter((i) => usableInMode(i, mode)).map((i) => i.key);
  const chosen = settings.enabledItems[pack.id];
  if (chosen) {
    const keys = usable.filter((k) => chosen.includes(k));
    if (keys.length >= MIN_ITEMS_PER_PACK) return keys;
  }
  return defaultSelection(pack, mode);
}
