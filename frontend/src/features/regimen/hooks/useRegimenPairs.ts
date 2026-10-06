import { useMemo } from 'react';

import { useExplorer, usePicks } from '@/state';

import { regimenPairs, type RegimenPair } from '../lib/pairs';

/** Distinct picks + every pair of them, worst first (memoised). */
export function useRegimenPairs(): { picks: string[]; pairs: RegimenPair[] } {
  const picks = usePicks();
  const neighbors = useExplorer((s) => s.neighbors);
  const pairs = useMemo(() => regimenPairs(picks, neighbors), [picks, neighbors]);
  return { picks, pairs };
}
