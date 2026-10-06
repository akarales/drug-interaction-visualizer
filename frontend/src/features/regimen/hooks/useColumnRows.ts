import { useMemo } from 'react';

import type { DrugSummary } from '@/api/schemas';
import { matchDrugs } from '@/features/search';
import { SEVERITY_RANK } from '@/shared/domain';
import { pickedIds, useExplorer } from '@/state';

import { regimenRisk, type Risk } from '../lib/pairs';

export type SortMode = 'risk' | 'az' | 'degree';
export const SORT_LABEL: Record<SortMode, string> = {
  risk: 'Risk first',
  az: 'A–Z',
  degree: 'Most connected',
};

export interface Row {
  drug: DrugSummary;
  /** the brand / RxNorm name that matched, when it isn't the drug name */
  via?: string;
}

/**
 * The list of one medication column: every drug (or the search matches),
 * minus the other picks, sorted by the column's sort mode, each annotated
 * with its worst interaction against the OTHER picked medications.
 */
export function useColumnRows(index: number, query: string, sortChoice: SortMode | null) {
  const drugs = useExplorer((s) => s.drugs);
  const slots = useExplorer((s) => s.slots);
  const neighbors = useExplorer((s) => s.neighbors);

  const picked = slots[index]?.drug ?? null;
  const others = useMemo(() => pickedIds(slots.filter((_, i) => i !== index)), [slots, index]);
  const sort: SortMode = sortChoice ?? (others.length > 0 ? 'risk' : 'az');
  const risk = useMemo<Map<string, Risk>>(() => regimenRisk(others, neighbors), [others, neighbors]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    let list: (Row & { bucket?: number })[] = q
      ? matchDrugs(drugs, q).map((m) => ({ drug: m.drug, via: m.via, bucket: Math.min(m.rank, 2) }))
      : drugs.map((drug) => ({ drug }));
    const byName = (a: Row, b: Row) => a.drug.name.localeCompare(b.drug.name);
    if (sort === 'degree') list.sort((a, b) => b.drug.degree - a.drug.degree || byName(a, b));
    else if (sort === 'risk')
      list.sort((a, b) => {
        const ra = risk.get(a.drug.id);
        const rb = risk.get(b.drug.id);
        const sa = ra ? SEVERITY_RANK[ra.worst] + 1 : 0;
        const sb = rb ? SEVERITY_RANK[rb.worst] + 1 : 0;
        return sb - sa || (rb?.count ?? 0) - (ra?.count ?? 0) || byName(a, b);
      });
    else list.sort(byName);
    // prefix matches first (direct name before alias), keeping the sort order
    if (q) list = [0, 1, 2].flatMap((k) => list.filter((r) => r.bucket === k));
    return list.filter((r) => !others.includes(r.drug.id)).map(({ drug, via }) => ({ drug, via }));
  }, [drugs, query, sort, risk, others]);

  return { drugs, picked, others, sort, risk, rows };
}
