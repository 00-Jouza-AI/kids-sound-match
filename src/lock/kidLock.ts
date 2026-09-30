/**
 * Everything Kid Mode switches on while a child plays (spec 6.3):
 * keep the screen awake, swallow the Back button, and block long-press menus, text
 * selection, image dragging and pinch zoom. Returns a function that undoes all of it.
 */
export function engageKidLock(): () => void {
  const prevent = (e: Event) => e.preventDefault();
  const blocked = ['contextmenu', 'selectstart', 'dragstart', 'gesturestart'] as const;
  for (const type of blocked) document.addEventListener(type, prevent, { passive: false });

  // Back button / back gesture: stay on the page. Each "back" lands on our extra history
  // entry, and we immediately put it back.
  history.pushState({ ksmKid: true }, '');
  const onPopState = () => history.pushState({ ksmKid: true }, '');
  window.addEventListener('popstate', onPopState);

  const wakeLock = new WakeLockKeeper();
  wakeLock.acquire();
  document.documentElement.classList.add('kid-locked');

  return () => {
    for (const type of blocked) document.removeEventListener(type, prevent);
    window.removeEventListener('popstate', onPopState);
    if ((history.state as { ksmKid?: boolean } | null)?.ksmKid) history.back();
    wakeLock.release();
    document.documentElement.classList.remove('kid-locked');
  };
}

/** Keeps the screen on during a session. Browsers drop the lock when the tab is hidden, so re-take it. */
export class WakeLockKeeper {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;
  private readonly onVisibility = () => {
    if (this.active && document.visibilityState === 'visible') void this.request();
  };

  acquire(): void {
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.request();
  }

  release(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }

  private async request(): Promise<void> {
    // Only available on HTTPS/localhost; over plain-http Wi-Fi testing the screen may dim.
    if (!('wakeLock' in navigator)) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
    } catch {
      // Denied (low battery, not visible): nothing to do.
    }
  }
}
