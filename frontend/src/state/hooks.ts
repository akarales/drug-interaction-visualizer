import { useMemo } from 'react';

import { pickedIds } from './selectors';
import { useExplorer } from './store';

/** Distinct picked drug ids, in column order. */
export function usePicks(): string[] {
  const slots = useExplorer((s) => s.slots);
  return useMemo(() => [...new Set(pickedIds(slots))], [slots]);
}
