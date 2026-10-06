import { memo } from 'react';
import { cn } from 'cn';

import type { DrugSummary } from '@/api/schemas';
import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { familyOf } from '@/shared/domain';
import { useExplorer } from '@/state';

import type { Risk } from '../lib/pairs';

export const ROW_HEIGHT = 28;

/** One virtualised drug row of a medication column. */
export const DrugRow = memo(function DrugRow({
  drug,
  via,
  top,
  risk,
  showRisk,
  picked,
  cursor,
  onPick,
}: {
  drug: DrugSummary;
  via?: string;
  top: number;
  risk: Risk | undefined;
  showRisk: boolean;
  picked: boolean;
  cursor: boolean;
  onPick: () => void;
}) {
  const hovered = useExplorer((s) => s.hover === drug.id);
  return (
    <div
      role="option"
      aria-selected={picked}
      onClick={onPick}
      onPointerEnter={() => useExplorer.getState().setHover(drug.id, 'list')}
      className={cn(
        'absolute inset-x-0 flex cursor-pointer items-center gap-2 border-l-2 border-transparent px-2.5 text-xs select-none',
        (hovered || cursor) && 'bg-muted/70',
        picked && 'border-primary bg-primary/15 font-medium',
        hovered && !picked && 'border-muted-foreground/50',
      )}
      style={{ top, height: ROW_HEIGHT }}
    >
      <FamilyDot family={familyOf(drug.category)} className="size-2 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {drug.name}
        {via && <span className="ml-1.5 text-[10px] text-muted-foreground">via {via}</span>}
      </span>
      {showRisk && risk ? (
        <span className="flex items-center gap-1">
          {risk.count > 1 && <span className="font-mono text-[10px] text-muted-foreground">×{risk.count}</span>}
          <SeverityChip severity={risk.worst} compact />
        </span>
      ) : showRisk ? (
        <span className="size-1.5 rounded-full bg-border" title="No interaction with the regimen in this dataset" />
      ) : (
        <span className="font-mono text-[10px] text-muted-foreground">{drug.degree}</span>
      )}
    </div>
  );
});
