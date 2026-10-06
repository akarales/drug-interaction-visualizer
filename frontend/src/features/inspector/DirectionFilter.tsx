import { ROLE_ARROW, ROLE_LABEL, type RoleOfFocus } from '@/shared/domain';

const HINT: Record<RoleOfFocus | 'all', string> = {
  all: 'All interactions',
  acts: 'The focused drug inhibits or induces a pathway the other drug depends on (FDA table)',
  affected: 'The other drug inhibits or induces a pathway the focused drug depends on (FDA table)',
  both: 'Each drug acts on the other (FDA table)',
};

/**
 * Filter the interaction list by FDA direction relative to the focused
 * drug. Pairs without FDA roles appear only under "All" (direction unknown).
 */
export function DirectionFilter({
  value,
  onChange,
  counts,
  total,
}: {
  value: RoleOfFocus | null;
  onChange: (role: RoleOfFocus | null) => void;
  counts: Record<RoleOfFocus, number>;
  total: number;
}) {
  const known = counts.acts + counts.affected + counts.both;
  return (
    <div role="radiogroup" aria-label="Filter by direction (FDA)" className="flex flex-wrap items-center gap-1 text-[11px]">
      {([null, 'acts', 'affected', 'both'] as const).map((r) => (
        <button
          key={r ?? 'all'}
          type="button"
          role="radio"
          aria-checked={value === r}
          disabled={r !== null && counts[r] === 0}
          onClick={() => onChange(r)}
          title={HINT[r ?? 'all']}
          className="flex h-6 items-center gap-1 rounded-md border px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 aria-checked:border-ring/60 aria-checked:bg-muted aria-checked:text-foreground"
        >
          {r ? `${ROLE_ARROW[r]} ${ROLE_LABEL[r]}` : 'All'}
          <span className="font-mono text-[10px] opacity-70">{r ? counts[r] : total}</span>
        </button>
      ))}
      <span className="text-muted-foreground">
        {known === 0 ? 'no FDA direction for these pairs' : `${(total - known).toLocaleString()} direction unknown`}
      </span>
    </div>
  );
}
