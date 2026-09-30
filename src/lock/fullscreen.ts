// The web stand-in for Android screen pinning (spec 6.1). A page can fill the screen, but
// the browser always lets the user leave; the first-run copy says so honestly.

type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

export function fullscreenSupported(): boolean {
  const el = document.documentElement as WebkitElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Must be called from a tap handler. Resolves to whether the page is now fullscreen. */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true;
  const el = document.documentElement as WebkitElement;
  try {
    if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    return false;
  }
  return isFullscreen();
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const doc = document as WebkitDocument;
  try {
    if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
  } catch {
    // Already left.
  }
}
