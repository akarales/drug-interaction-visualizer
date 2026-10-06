import { useMemo } from 'react';
import { cn } from 'cn';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FamilyDot } from '@/shared/components/FamilyDot';
import { FAMILIES, FAMILY_COLOR, FAMILY_LABEL, SEVERITY_COLOR, familyOf, type Family } from '@/shared/domain';
import { useExplorer } from '@/state';

/** Family legend that doubles as a filter (click = focus that family). */
export function FamilyLegend() {
  const drugs = useExplorer((s) => s.drugs);
  const focus = useExplorer((s) => s.familyFocus);
  const toggle = useExplorer((s) => s.toggleFamily);
  const counts = useMemo(() => {
    const c = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
    for (const d of drugs) c[familyOf(d.category)] += 1;
    return c;
  }, [drugs]);

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-sm backdrop-blur-md">
      {FAMILIES.map((family) => (
        <Tooltip key={family}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={focus === family}
              onClick={() => toggle(family)}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                focus === family && 'bg-muted text-foreground ring-1 ring-ring/60',
              )}
            >
              <FamilyDot family={family} />
              {FAMILY_LABEL[family]}
              <span className="font-mono text-[10px] opacity-60">{counts[family]}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Drugs whose most common interaction type is {FAMILY_LABEL[family].toLowerCase()} — click
            to focus
          </TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 flex h-6 cursor-help items-center gap-1 border-l pl-2 text-[11px] text-muted-foreground">
            <span aria-hidden className="font-mono text-primary">→</span> FDA direction
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          Arrow on a regimen edge: the source drug inhibits or induces a CYP enzyme or transporter the
          target drug is a substrate of (FDA table). No arrow = direction unknown, not &quot;no effect&quot;.
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1 flex h-6 cursor-help items-center gap-1.5 border-l pl-2 text-[11px] text-muted-foreground">
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
              <circle cx="10" cy="10" r="8" fill="none" stroke={SEVERITY_COLOR.moderate} strokeOpacity="0.25" strokeWidth="3" />
              <path d="M10 2 A8 8 0 0 1 17.6 12.5" fill="none" stroke={SEVERITY_COLOR.severe} strokeWidth="3" />
              <path d="M10 2 A8 8 0 0 1 15.7 4.3" fill="none" stroke={SEVERITY_COLOR.contraindicated} strokeWidth="3" />
              <circle cx="10" cy="10" r="4.5" fill={FAMILY_COLOR.pk} />
            </svg>
            Ring = severe share
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          Each node&apos;s ring shows what share of its interactions are contraindicated (red) or
          severe (orange); node size = number of interactions.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
