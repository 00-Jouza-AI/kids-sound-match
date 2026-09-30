/**
 * Browser storage that never throws. Storage can be blocked (private mode, site data disabled)
 * or full; the app then keeps working with defaults instead of crashing.
 */
function wrap(getStore: () => Storage) {
  return {
    get(key: string): string | null {
      try {
        return getStore().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        getStore().setItem(key, value);
      } catch {
        // Full or blocked: nothing sensible to do.
      }
    },
    remove(key: string): void {
      try {
        getStore().removeItem(key);
      } catch {
        // ignore
      }
    },
    getJson<T>(key: string): T | null {
      const raw = this.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson(key: string, value: unknown): void {
      this.set(key, JSON.stringify(value));
    },
  };
}

/** Survives restarts (settings, PIN hash, telemetry buffer). */
export const local = wrap(() => window.localStorage);
/** Survives a reload of this tab only (an in-progress game). */
export const session = wrap(() => window.sessionStorage);
