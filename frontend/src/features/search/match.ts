import type { DrugSummary } from '@/api/schemas';

import { aliasIds } from './aliases';

/**
 * Match quality, best first:
 * 0 name starts with the query · 1 alias / common name starts with it ·
 * 2 name contains it · 3 alias contains it
 */
export type MatchRank = 0 | 1 | 2 | 3;

export interface DrugMatch {
  drug: DrugSummary;
  /** the brand / RxNorm / common name that matched, when it isn't the drug name */
  via?: string;
  rank: MatchRank;
}

/**
 * Match `query` against dataset names, then RxNorm aliases (brands, INN,
 * salts), then the built-in common names. Unordered — callers sort (the
 * palette by rank, the columns by rank bucket within their chosen sort).
 */
export function matchDrugs(drugs: readonly DrugSummary[], query: string): DrugMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const builtin = aliasIds(q);
  const out: DrugMatch[] = [];
  for (const drug of drugs) {
    const name = drug.name.toLowerCase();
    if (name.includes(q)) {
      out.push({ drug, rank: name.startsWith(q) ? 0 : 2 });
      continue;
    }
    const alias = drug.aliases?.find((a) => a.toLowerCase().includes(q));
    if (alias) out.push({ drug, via: alias, rank: alias.toLowerCase().startsWith(q) ? 1 : 3 });
    else if (builtin.has(drug.id)) out.push({ drug, via: q, rank: 1 });
  }
  return out;
}
