import type { NeighborInfo } from '@/api/schemas';
import { SEVERITY_RANK, asSeverity, worse, type Severity } from '@/shared/domain';
import { pairInfo, type NeighborMap } from '@/state';

type Neighbors = Readonly<Record<string, NeighborMap>>;

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
export function regimenPairs(picks: readonly string[], neighbors: Neighbors): RegimenPair[] {
  const out: RegimenPair[] = [];
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const { loaded, info } = pairInfo(neighbors, picks[i], picks[j]);
      out.push({ a: picks[i], b: picks[j], loaded, info, severity: info ? asSeverity(info.severity) : null });
    }
  const rank = (p: RegimenPair) => (p.severity ? SEVERITY_RANK[p.severity] + 1 : 0);
  return out.sort((x, y) => rank(y) - rank(x));
}

/** Worst interacting pair among the picked medications (pair-card default). */
export function worstRegimenPair(picks: readonly string[], neighbors: Neighbors): [string, string] | null {
  let best: [string, string] | null = null;
  let bestRank = -2;
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const { info } = pairInfo(neighbors, picks[i], picks[j]);
      const rank = info ? SEVERITY_RANK[asSeverity(info.severity)] : -1;
      if (rank > bestRank) {
        bestRank = rank;
        best = [picks[i], picks[j]];
      }
    }
  return best;
}

export interface Risk {
  worst: Severity;
  /** how many of `against` interact with the drug */
  count: number;
}

/**
 * Worst interaction of every drug against the given medications — the live
 * "what if I add this?" check behind the column lists and the palette.
 */
export function regimenRisk(against: readonly string[], neighbors: Neighbors): Map<string, Risk> {
  const out = new Map<string, Risk>();
  for (const other of against) {
    const map = neighbors[other];
    if (!map) continue;
    for (const n of map.values()) {
      const prev = out.get(n.id);
      out.set(n.id, {
        worst: worse(prev?.worst ?? null, asSeverity(n.severity)),
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  return out;
}
