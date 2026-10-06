import { useMemo } from 'react';

import { SeverityChip } from '@/shared/components/SeverityChip';
import { SEVERITY_RANK, asSeverity } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

import { Empty } from './Empty';

/** Drugs that interact with BOTH drugs of the pair (adding one affects the whole pair). */
export function SharedInteractors({ a, b }: { a: string; b: string }) {
  const neighbors = useExplorer((s) => s.neighbors);
  const name = useDrugName();
  const shared = useMemo(() => {
    const ma = neighbors[a];
    const mb = neighbors[b];
    if (!ma || !mb) return null;
    return [...ma.values()]
      .flatMap((n) => {
        const other = mb.get(n.id);
        return other ? [{ id: n.id, name: n.name, sa: asSeverity(n.severity), sb: asSeverity(other.severity) }] : [];
      })
      .sort(
        (x, y) =>
          Math.max(SEVERITY_RANK[y.sa], SEVERITY_RANK[y.sb]) - Math.max(SEVERITY_RANK[x.sa], SEVERITY_RANK[x.sb]) ||
          x.name.localeCompare(y.name),
      );
  }, [neighbors, a, b]);
  if (!shared) return <Empty text="Loading both interaction lists…" />;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">
        {shared.length.toLocaleString()} drugs interact with both {name(a)} and {name(b)} — adding any
        of them affects the whole pair.
      </p>
      <ul className="max-h-56 overflow-y-auto">
        {shared.slice(0, 40).map((d) => (
          <li
            key={d.id}
            onPointerEnter={() => useExplorer.getState().setHover(d.id, 'list')}
            onPointerLeave={() => useExplorer.getState().setHover(null, 'list')}
            className="flex items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-muted/60"
          >
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <SeverityChip severity={d.sa} compact />
            <SeverityChip severity={d.sb} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}
