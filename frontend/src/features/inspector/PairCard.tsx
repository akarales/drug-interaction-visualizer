import { ArrowLeftRight, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExplainPanel } from '@/features/explain';
import { OverrideRecord } from '@/features/regimen';
import { DirectionLine } from '@/shared/components/DirectionLine';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { TIER_ACTION, basisLabel, kindLabel } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { pairInfo, pairSeverity, useExplorer } from '@/state';

/**
 * The seven DDI decision-support elements (Payne et al., JAMIA 2015):
 * drugs, seriousness, clinical consequence, mechanism, modifying factors,
 * recommended action, evidence — plus an optional AI explanation that is
 * grounded in the same record and can never change its severity.
 */
export function PairCard({ a, b, pinned }: { a: string; b: string; pinned: boolean }) {
  const neighbors = useExplorer((s) => s.neighbors);
  const setInspectPair = useExplorer((s) => s.setInspectPair);
  const name = useDrugName();
  const { loaded, info } = pairInfo(neighbors, a, b);
  const severity = pairSeverity(info);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name(a)} <ArrowLeftRight className="inline size-3.5 text-muted-foreground" aria-label="and" />{' '}
          {name(b)}
        </p>
        {pinned && (
          <Button size="icon-xs" variant="ghost" aria-label="Unpin pair" onClick={() => setInspectPair(null)}>
            <X />
          </Button>
        )}
      </div>

      {!loaded && <Skeleton className="h-24 w-full" />}
      {loaded && !info && (
        <p className="rounded-md border border-dashed p-2.5 text-xs leading-relaxed text-muted-foreground">
          No interaction between these drugs was found in this dataset. Absence from one pairwise
          dataset is not a safety claim — dose, patient factors and multi-drug effects are not
          covered.
        </p>
      )}
      {info && severity && (
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2.5 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Seriousness</dt>
          <dd>
            <SeverityChip severity={severity} />
          </dd>
          <dt className="text-muted-foreground">Consequence</dt>
          <dd>{kindLabel(info.kind)}</dd>
          <dt className="text-muted-foreground">Direction</dt>
          <dd>
            <DirectionLine roles={info.roles} />
          </dd>
          <dt className="text-muted-foreground">Mechanism</dt>
          <dd className="leading-relaxed">{info.mechanism}</dd>
          <dt className="text-muted-foreground">Modifying factors</dt>
          <dd className="text-muted-foreground">Not in this dataset (dose, duration, patient factors).</dd>
          <dt className="text-muted-foreground">Action</dt>
          <dd>
            {TIER_ACTION[severity]}{' '}
            <span className="text-[10px] text-muted-foreground">(editorial, by tier)</span>
          </dd>
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="text-muted-foreground">{basisLabel(info.severity_basis)} · DrugBank-derived</dd>
        </dl>
      )}

      <OverrideRecord a={a} b={b} />

      <ExplainPanel a={a} b={b} severity={severity} ready={loaded} />
    </div>
  );
}
