import { useCallback } from 'react';

import { useExplorer } from '@/state';

type DrugsById = ReadonlyMap<string, { name: string }>;

/** Display name for a dataset id (falls back to the id itself). */
export function drugName(byId: DrugsById, id: string): string {
  return byId.get(id)?.name ?? id;
}

/** `name(id)` bound to the loaded dataset. */
export function useDrugName(): (id: string) => string {
  const byId = useExplorer((s) => s.byId);
  return useCallback((id: string) => drugName(byId, id), [byId]);
}
