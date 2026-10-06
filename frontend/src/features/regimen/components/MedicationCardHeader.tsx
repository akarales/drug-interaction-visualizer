import type { ReactNode } from 'react';
import { cn } from 'cn';
import { PanelLeftClose, SquareArrowOutUpRight, X } from 'lucide-react';

import type { DrugSummary } from '@/api/schemas';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CollapseToggle } from '@/shared/components/CollapseToggle';
import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { FAMILY_LABEL, familyOf, type Severity } from '@/shared/domain';

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={label}
          // header actions must not also make the card active (that moves the graph focus)
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Card header — also the whole card when collapsed: position, drug, family ·
 * degree, worst interaction with the rest of the regimen, and actions.
 */
export function MedicationCardHeader({
  index,
  drug,
  worst,
  isActive,
  collapsed,
  onToggle,
  grip,
  floating,
  onFloat,
  onRemove,
}: {
  index: number;
  drug: DrugSummary | undefined;
  worst: Severity | undefined;
  isActive: boolean;
  collapsed: boolean;
  /** omitted = not collapsible (an empty card is always open) */
  onToggle?: () => void;
  grip?: ReactNode;
  floating: boolean;
  /** pop out (docked) / dock back (floating); omitted = not available here */
  onFloat?: () => void;
  onRemove?: () => void;
}) {
  const label = `medication ${index + 1}`;
  return (
    <header className={cn('flex h-11 shrink-0 items-center gap-1.5 pr-1.5 pl-2', !collapsed && 'border-b')}>
      {grip}
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px]',
          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-xs font-semibold', !drug && 'text-muted-foreground')}>
          {drug?.name ?? (index === 0 ? 'Choose a medication' : 'Choose the next medication')}
        </p>
        {drug && (
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <FamilyDot family={familyOf(drug.category)} className="size-1.5" />
            {FAMILY_LABEL[familyOf(drug.category)]} · {drug.degree} interactions
          </p>
        )}
      </div>
      {worst && <SeverityChip severity={worst} compact />}
      {onFloat && (
        <IconAction label={floating ? `Dock ${label} back into the list` : `Pop out ${label}`} onClick={onFloat}>
          {floating ? <PanelLeftClose /> : <SquareArrowOutUpRight />}
        </IconAction>
      )}
      {onToggle && <CollapseToggle open={!collapsed} onToggle={onToggle} label={label} />}
      {onRemove && (
        <IconAction label={`Remove ${label}`} onClick={onRemove}>
          <X />
        </IconAction>
      )}
    </header>
  );
}
