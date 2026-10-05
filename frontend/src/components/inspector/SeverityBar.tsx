import { SEVERITIES, SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from '@/lib/domain';

/**
 * Stacked severity-mix bar with a text legend (length encodes share; the
 * legend carries exact counts so colour is never the only channel).
 */
export function SeverityBar({
  counts,
  onPick,
  active,
}: {
  counts: Partial<Record<Severity, number>>;
  /** clicking a legend item (e.g. to filter); omitted = static */
  onPick?: (severity: Severity) => void;
  active?: Severity | null;
}) {
  const total = SEVERITIES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Severity mix">
        {SEVERITIES.map((s) =>
          counts[s] ? (
            <span
              key={s}
              style={{ width: `${((counts[s] ?? 0) / total) * 100}%`, background: SEVERITY_COLOR[s] }}
              className="h-full min-w-[3px]"
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {SEVERITIES.map((s) => {
          const n = counts[s] ?? 0;
          const body = (
            <>
              <span className="size-2 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />
              {SEVERITY_LABEL[s]}
              <span className="font-mono text-[10px] text-muted-foreground">{n.toLocaleString()}</span>
            </>
          );
          return onPick ? (
            <button
              key={s}
              type="button"
              disabled={n === 0}
              aria-pressed={active === s}
              onClick={() => onPick(s)}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted disabled:opacity-40 aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-ring/60"
            >
              {body}
            </button>
          ) : (
            <span key={s} className="flex items-center gap-1.5">
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}
