import { useMemo } from 'react';

import { SeverityBar } from '@/shared/components/SeverityBar';
import type { Severity } from '@/shared/domain';
import { useExplorer } from '@/state';

/** Dataset size, severity mix, most-connected drugs and the severity method. */
export function DatasetSummary() {
  const stats = useExplorer((s) => s.stats);
  const drugs = useExplorer((s) => s.drugs);
  const hubs = useMemo(() => [...drugs].sort((x, y) => y.degree - x.degree).slice(0, 8), [drugs]);
  if (!stats) return null;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        <span className="font-mono text-foreground">{stats.drugs.toLocaleString()}</span> drugs ·{' '}
        <span className="font-mono text-foreground">{stats.interactions.toLocaleString()}</span> pairwise
        interactions (Kaggle, DrugBank-derived)
      </p>
      <SeverityBar counts={stats.severity_mix as Partial<Record<Severity, number>>} />
      <div>
        <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Most connected
        </p>
        <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {hubs.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  const s = useExplorer.getState();
                  s.pick(s.active, h.id);
                }}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-muted/60"
              >
                <span className="truncate">{h.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{h.degree}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Severity is editorial: a reviewed table by interaction type plus the ONC high-priority
        (contraindicated) pairs (Phansalkar et al., JAMIA 2012) — not clinical grading.
      </p>
    </div>
  );
}
