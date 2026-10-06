import type { DrugSummary, NeighborInfo } from '@/api/schemas';
import { useExplorer, type NeighborMap } from '@/state';

export const drug = (id: string, name = id): DrugSummary => ({ id, name, category: 'metabolism', degree: 1 });

export const interaction = (id: string, severity: string, extra: Partial<NeighborInfo> = {}): NeighborInfo => ({
  id,
  name: id,
  category: 'metabolism',
  kind: 'exposure',
  direction: 'increase',
  severity,
  severity_basis: severity === 'contraindicated' ? 'onc:11' : 'kind:exposure',
  mechanism: `Mechanism text for ${id}.`,
  ...extra,
});

/** Put a regimen straight into the store (no network): drugs + their loaded interaction lists. */
export function seedRegimen(
  drugs: DrugSummary[],
  picks: string[],
  neighbors: Record<string, NeighborInfo[]>,
): void {
  useExplorer.setState({
    drugs,
    byId: new Map(drugs.map((d) => [d.id, d])),
    slots: picks.map((id, i) => ({ key: 1000 + i, drug: id })),
    active: picks.length - 1,
    overrides: {},
    neighbors: Object.fromEntries(
      Object.entries(neighbors).map(([id, list]) => [id, new Map(list.map((n) => [n.id, n])) as NeighborMap]),
    ),
  });
}
