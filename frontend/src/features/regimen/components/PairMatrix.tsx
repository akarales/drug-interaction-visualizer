import { GRAPH_COLOR, SEVERITY_COLOR, SEVERITY_SHORT } from '@/shared/domain';
import { pairKey, useExplorer } from '@/state';

import type { RegimenPair } from '../lib/pairs';

/**
 * N×N heat-map: cell colour = severity of that pair (text label too, so
 * colour is never the only channel). Hover links to the graph; click pins
 * the pair in the inspector.
 */
export function PairMatrix({
  picks,
  pairs,
  name,
}: {
  picks: string[];
  pairs: RegimenPair[];
  name: (id: string) => string;
}) {
  const overrides = useExplorer((s) => s.overrides);
  const byKey = new Map(pairs.map((p) => [pairKey(p.a, p.b), p]));
  return (
    <div className="p-3">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th />
            {picks.map((id, j) => (
              <th key={id} scope="col" title={name(id)} className="h-5 w-8 font-mono font-normal text-muted-foreground">
                {j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {picks.map((row, i) => (
            <tr key={row}>
              <th scope="row" className="max-w-28 truncate pr-1.5 text-left font-normal" title={name(row)}>
                <span className="mr-1 font-mono text-muted-foreground">{i + 1}</span>
                {name(row)}
              </th>
              {picks.map((col, j) => {
                if (i === j)
                  return <td key={col} className="size-8 rounded-sm bg-muted/30" aria-hidden />;
                const p = byKey.get(pairKey(row, col));
                const color = p?.severity ? SEVERITY_COLOR[p.severity] : null;
                const overridden = Boolean(overrides[pairKey(row, col)]);
                return (
                  <td key={col} className="p-0">
                    <button
                      type="button"
                      disabled={!p?.info}
                      onClick={() => useExplorer.getState().setInspectPair([row, col])}
                      onPointerEnter={() => useExplorer.getState().setHover(col, 'list')}
                      onPointerLeave={() => useExplorer.getState().setHover(null, 'list')}
                      aria-label={`${name(row)} + ${name(col)}: ${p?.severity ?? (p?.loaded ? 'not found in dataset' : 'loading')}`}
                      title={`${name(row)} + ${name(col)}: ${p?.severity ?? 'not found in dataset'}`}
                      className="relative flex size-8 items-center justify-center rounded-sm font-mono text-[9px] font-semibold disabled:cursor-default"
                      style={
                        color
                          ? { background: `${color}cc`, color: GRAPH_COLOR.onSeverity }
                          : { boxShadow: 'inset 0 0 0 1px var(--border)', color: 'var(--muted-foreground)' }
                      }
                    >
                      {p?.severity ? SEVERITY_SHORT[p.severity] : p?.loaded ? '·' : '…'}
                      {overridden && (
                        <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-white" aria-label="overridden" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted-foreground">
        · = not found in this dataset (not a safety claim) · white dot = overridden
      </p>
    </div>
  );
}
