import { ArrowRight } from 'lucide-react';

import type { PairRoles } from '@/api/schemas';
import { exposureEffect, objectRole, precipitantRole } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

/**
 * Which drug acts on which, from the FDA CYP/transporter table, with the
 * citation. Unknown is stated as unknown — never inferred from the dataset
 * sentence (its wording reverses inhibitor roles in most rows).
 */
export function DirectionLine({ roles, compact = false }: { roles: PairRoles | undefined; compact?: boolean }) {
  const name = useDrugName();
  const source = useExplorer((s) => s.directionSource);
  if (!roles)
    return (
      <span className="text-muted-foreground">
        Not established — the FDA CYP/transporter table lists no inhibitor/inducer → substrate relation for this pair.
      </span>
    );
  return (
    <span className="flex flex-col gap-1">
      {roles.links.map((l) => (
        <span key={`${l.precipitant}|${l.pathway}|${l.effect}`} className="leading-relaxed">
          <span className="font-medium">{name(l.precipitant)}</span>{' '}
          <span className="text-muted-foreground">({precipitantRole(l)})</span>{' '}
          <ArrowRight className="inline size-3 text-primary" aria-label="acts on" />{' '}
          <span className="font-medium">{name(l.object)}</span>{' '}
          <span className="text-muted-foreground">
            ({objectRole(l)}) — {exposureEffect(l)}
          </span>
        </span>
      ))}
      {!compact && source && (
        <span className="text-[11px] text-muted-foreground">
          Source:{' '}
          <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
            FDA CYP/transporter table
          </a>{' '}
          (content {source.content_date}, retrieved {source.retrieved}) · pharmacokinetic roles, independent of the
          dataset&apos;s interaction type
        </span>
      )}
    </span>
  );
}
