import { useSyncExternalStore } from 'react';

/** Live `matchMedia` result (false where matchMedia is unavailable, e.g. tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** The three-column workspace needs at least this width; below it panels become drawers. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
