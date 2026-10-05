import { toast } from 'sonner';

import type { NeighborInfo } from '@/api/types';
import { SEVERITY_RANK, asSeverity, basisLabel, kindLabel, type Severity } from '@/lib/domain';
import {
  pairInfo,
  pairKey,
  pickedIds,
  useExplorer,
  type NeighborMap,
  type Override,
} from '@/state/explorer';

/** One pair of the regimen, with whatever the dataset says about it. */
export interface RegimenPair {
  a: string;
  b: string;
  /** at least one side's interaction list is loaded */
  loaded: boolean;
  info: NeighborInfo | null;
  severity: Severity | null;
}

/** Every unordered pair of the picked drugs, worst first. */
export function regimenPairs(
  picks: readonly string[],
  neighbors: Readonly<Record<string, NeighborMap>>,
): RegimenPair[] {
  const out: RegimenPair[] = [];
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const { loaded, info } = pairInfo(neighbors, picks[i], picks[j]);
      out.push({ a: picks[i], b: picks[j], loaded, info, severity: info ? asSeverity(info.severity) : null });
    }
  const rank = (p: RegimenPair) => (p.severity ? SEVERITY_RANK[p.severity] + 1 : 0);
  return out.sort((x, y) => rank(y) - rank(x));
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV of the regimen check (one row per pair). */
export function regimenCsv(
  pairs: readonly RegimenPair[],
  name: (id: string) => string,
  overrides: Readonly<Record<string, Override>>,
): string {
  const header = [
    'drug_a',
    'drug_b',
    'severity',
    'severity_basis',
    'consequence',
    'mechanism',
    'override_reason',
    'override_at',
  ];
  const rows = pairs.map((p) => {
    const override = overrides[pairKey(p.a, p.b)];
    return [
      name(p.a),
      name(p.b),
      p.severity ?? 'not found in dataset',
      p.info ? basisLabel(p.info.severity_basis) : '',
      p.info ? kindLabel(p.info.kind) : '',
      p.info?.mechanism ?? '',
      override?.reason ?? '',
      override?.at ?? '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
  const name = (id: string) => s.byId.get(id)?.name ?? id;
  downloadText(
    `regimen-check-${new Date().toISOString().slice(0, 10)}.csv`,
    regimenCsv(regimenPairs(picks, s.neighbors), name, s.overrides),
    'text/csv;charset=utf-8',
  );
}
