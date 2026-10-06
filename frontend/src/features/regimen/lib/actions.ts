import { toast } from 'sonner';

import { drugName } from '@/shared/hooks/useDrugName';
import { pickedIds, useExplorer } from '@/state';

import { downloadText, regimenCsv } from './csv';
import { regimenPairs } from './pairs';

/** Copy the shareable regimen URL (overrides are not part of it). */
export function copyRegimenLink(): void {
  navigator.clipboard
    .writeText(window.location.href)
    .then(() => toast.success('Link copied', { description: 'Opens this regimen (overrides are not shared).' }))
    .catch(() => toast.error('Could not copy the link'));
}

/** Download the current regimen check as CSV. */
export function exportRegimenCsv(): void {
  const s = useExplorer.getState();
  const picks = [...new Set(pickedIds(s.slots))];
  if (picks.length < 2) {
    toast.info('Add at least two medications to export a regimen check.');
    return;
  }
  downloadText(
    `regimen-check-${new Date().toISOString().slice(0, 10)}.csv`,
    regimenCsv(regimenPairs(picks, s.neighbors), (id) => drugName(s.byId, id), s.overrides),
    'text/csv;charset=utf-8',
  );
}
