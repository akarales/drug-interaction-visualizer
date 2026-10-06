import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { FAMILY_LABEL, familyOf, kindLabel } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { pairInfo, pairSeverity, useExplorer, usePicks } from '@/state';

/**
 * Readout for the hovered drug, docked in a corner — text never sits on
 * the graph. With a medication active, it previews the pair (the
 * "hover-scrub compare" interaction).
 */
export function HoverReadout() {
  const hover = useExplorer((s) => s.hover);
  const byId = useExplorer((s) => s.byId);
  const neighbors = useExplorer((s) => s.neighbors);
  const picks = usePicks();
  const name = useDrugName();
  if (!hover) return null;
  const drug = byId.get(hover);
  if (!drug) return null;
  const family = familyOf(drug.category);
  const pairs = picks.filter((id) => id !== hover).map((id) => ({ id, ...pairInfo(neighbors, id, hover) }));
  const single = pairs.length === 1 ? pairs[0] : null;

  return (
    <div className="glass pointer-events-none absolute top-3 right-3 z-(--z-overlay) w-80 max-w-[calc(100%-1.5rem)] rounded-lg border p-3 text-xs shadow-lg">
      <p className="truncate text-sm font-semibold text-popover-foreground">{drug.name}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
        <FamilyDot family={family} />
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
                  with <span className="text-foreground">{name(p.id)}</span>
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
