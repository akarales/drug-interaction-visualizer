import { useMemo } from 'react';
import { cn } from 'cn';
import { Maximize2, Minus, Network, Plus, Waypoints } from 'lucide-react';

import { SeverityChip } from '@/components/SeverityChip';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GraphHandle } from '@/components/graph/DrugGraph';
import {
  FAMILIES,
  FAMILY_COLOR,
  FAMILY_LABEL,
  SEVERITY_COLOR,
  familyOf,
  kindLabel,
  type Family,
} from '@/lib/domain';
import { pairInfo, pairSeverity, pickedIds, useExplorer } from '@/state/explorer';

/**
 * Readout for the hovered drug, docked in a corner — text never sits on
 * the graph. With a medication active, it previews the pair (the
 * "hover-scrub compare" interaction).
 */
export function HoverReadout() {
  const hover = useExplorer((s) => s.hover);
  const slots = useExplorer((s) => s.slots);
  const byId = useExplorer((s) => s.byId);
  const neighbors = useExplorer((s) => s.neighbors);
  if (!hover) return null;
  const drug = byId.get(hover);
  if (!drug) return null;
  const family = familyOf(drug.category);
  const pairs = [...new Set(pickedIds(slots))]
    .filter((id) => id !== hover)
    .map((id) => ({ id, ...pairInfo(neighbors, id, hover) }));
  const single = pairs.length === 1 ? pairs[0] : null;

  return (
    <div className="pointer-events-none absolute right-3 bottom-14 z-20 w-80 rounded-lg border bg-popover/90 p-3 text-xs shadow-lg backdrop-blur-md">
      <p className="truncate text-sm font-semibold text-popover-foreground">{drug.name}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: FAMILY_COLOR[family] }} />
        {FAMILY_LABEL[family]} · {drug.degree.toLocaleString()} interactions
      </p>
      {pairs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t pt-2">
          {pairs.map((p) => {
            const severity = pairSeverity(p.info);
            return (
              <li key={p.id} className="flex items-center gap-2">
                {severity ? (
                  <SeverityChip severity={severity} compact />
                ) : (
                  <span className="w-9 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
                    {p.loaded ? '—' : '…'}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  with <span className="text-foreground">{byId.get(p.id)?.name ?? p.id}</span>
                </span>
                <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                  {p.info ? kindLabel(p.info.kind) : p.loaded ? 'none in dataset' : ''}
                </span>
              </li>
            );
          })}
          {single?.info && (
            <li className="line-clamp-3 leading-relaxed text-foreground/80">{single.info.mechanism}</li>
          )}
          {pairs.some((p) => p.loaded && !p.info) && (
            <li className="text-[10px] text-muted-foreground">
              “None in dataset” is not a safety claim.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

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
              <span className="size-2 rounded-full" style={{ background: FAMILY_COLOR[family] }} />
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

/** Summary bundles non-severe edges per family; All draws every edge. */
export function EdgeModeToggle() {
  const mode = useExplorer((s) => s.edgeMode);
  const setMode = useExplorer((s) => s.setEdgeMode);
  const options = [
    {
      value: 'summary' as const,
      icon: Waypoints,
      label: 'Summary edges',
      hint: 'One arc per family (orange = severe, family colour = other; width = count); contraindicated pairs drawn individually; hover a drug for its own edge',
    },
    { value: 'all' as const, icon: Network, label: 'All edges', hint: 'Every interaction of the focused drug' },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-card/80 p-1 shadow-sm backdrop-blur-md" role="radiogroup" aria-label="Edge display">
      {options.map(({ value, icon: Icon, label, hint }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              role="radio"
              aria-checked={mode === value}
              aria-label={label}
              onClick={() => setMode(value)}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            <span className="font-medium">{label}</span> — {hint}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function ZoomControls({ graph }: { graph: GraphHandle | null }) {
  const items = [
    { label: 'Zoom in', icon: Plus, run: () => graph?.zoomIn() },
    { label: 'Zoom out', icon: Minus, run: () => graph?.zoomOut() },
    { label: 'Fit all', icon: Maximize2, run: () => graph?.reset() },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-card/80 p-1 shadow-sm backdrop-blur-md">
      {items.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={label} onClick={run} disabled={!graph}>
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
