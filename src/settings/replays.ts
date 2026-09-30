import { local } from './storage';

/** Games the child may start from the end screen each day. 99 means no limit; 0 means parent only. */
export const REPLAY_LIMITS = [0, 1, 3, 5, 99] as const;
export const NO_REPLAY_LIMIT = 99;

export interface ReplayCount {
  day: string;
  count: number;
}

const KEY = 'ksm.replays.v1';

/** The local calendar day, so the count starts again each morning. */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function replaysLeftFrom(stored: ReplayCount | null, limit: number, now: Date): number {
  if (limit >= NO_REPLAY_LIMIT) return Number.POSITIVE_INFINITY;
  const used = stored && stored.day === dayKey(now) ? stored.count : 0;
  return Math.max(0, limit - used);
}

export function afterReplay(stored: ReplayCount | null, now: Date): ReplayCount {
  const day = dayKey(now);
  return { day, count: stored && stored.day === day ? stored.count + 1 : 1 };
}

export function replaysLeft(limit: number, now = new Date()): number {
  return replaysLeftFrom(local.getJson<ReplayCount>(KEY), limit, now);
}

export function countReplay(now = new Date()): void {
  local.setJson(KEY, afterReplay(local.getJson<ReplayCount>(KEY), now));
}
