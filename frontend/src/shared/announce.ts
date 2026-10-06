/** id of the app-wide polite live region (rendered once by the app shell) */
export const LIVE_REGION_ID = 'live-region';

/** Tell screen-reader users about a change they caused but can't see (e.g. a reorder). */
export function announce(message: string): void {
  const el = document.getElementById(LIVE_REGION_ID);
  if (!el) return;
  // clear first so repeating the same message is announced again
  el.textContent = '';
  window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}
