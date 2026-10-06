import { useEffect, useState } from 'react';

import { resolveDrug } from '@/api/drugs';
import type { ResolveMatch } from '@/api/schemas';

/** Live RxNorm fallback only when nothing matches locally. */
export const RXNAV_MIN_QUERY = 3;
const RXNAV_DEBOUNCE_MS = 350;

export type RxNormStatus = 'idle' | 'loading' | 'done';

/**
 * Hybrid search: when `enabled` (no local match), ask RxNorm for `query`
 * (debounced, abortable). Results belong to the query they were fetched
 * for, so typing on immediately shows "loading" again — no stale matches.
 */
export function useRxNormFallback(
  query: string,
  enabled: boolean,
  exclude: readonly string[],
): { status: RxNormStatus; suggestions: ResolveMatch[] } {
  const q = query.trim();
  const [result, setResult] = useState<{ q: string; matches: ResolveMatch[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      resolveDrug(q, controller.signal)
        .then((body) => setResult({ q, matches: body.matches.filter((m) => !exclude.includes(m.id)) }))
        .catch(() => {
          if (!controller.signal.aborted) setResult({ q, matches: [] });
        });
    }, RXNAV_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, q, exclude]);

  if (q.length < RXNAV_MIN_QUERY) return { status: 'idle', suggestions: [] };
  const current = result?.q === q ? result.matches : null;
  return current ? { status: 'done', suggestions: current } : { status: 'loading', suggestions: [] };
}
