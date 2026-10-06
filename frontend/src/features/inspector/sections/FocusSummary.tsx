import { useMemo } from 'react';

import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityBar } from '@/shared/components/SeverityBar';
import { FAMILY_LABEL, familyOf, kindLabel, severityCounts } from '@/shared/domain';
import { useExplorer, type NeighborMap } from '@/state';

/** The focused drug: family, dominant kind, brand names, severity mix. */
export function FocusSummary({ id, map }: { id: string; map: NeighborMap | undefined }) {
  const drug = useExplorer((s) => s.byId.get(id));
  const counts = useMemo(() => severityCounts(map?.values() ?? []), [map]);
  if (!drug) return null;
  const family = familyOf(drug.category);
  const brands = (drug.aliases ?? []).slice(0, 6);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-base font-semibold">{drug.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FamilyDot family={family} />
          {FAMILY_LABEL[family]} · mostly {kindLabel(drug.category)}
        </p>
      </div>
      {brands.length > 0 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-foreground/80">Also known as </span>
          {brands.join(', ')}
          {(drug.aliases?.length ?? 0) > brands.length && ` +${(drug.aliases?.length ?? 0) - brands.length}`}
        </p>
      )}
      {map ? <SeverityBar counts={counts} /> : <p className="text-xs text-muted-foreground">Loading…</p>}
    </div>
  );
}
