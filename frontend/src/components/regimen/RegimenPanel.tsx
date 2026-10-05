import { useMemo, useState } from 'react';
import { cn } from 'cn';
import {
  ChevronRight,
  Download,
  Grid3x3,
  Link2,
  List,
  OctagonAlert,
  Printer,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';

import { SeverityChip } from '@/components/SeverityChip';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SEVERITY_COLOR, basisLabel, kindLabel } from '@/lib/domain';
import { copyRegimenLink, exportRegimenCsv, regimenPairs, type RegimenPair } from '@/lib/regimen';
import { pairKey, pickedIds, useExplorer } from '@/state/explorer';

/**
 * Every pair in the regimen, worst first, as a list or an N×N heat-map
 * matrix. Absence of a pair in the dataset is shown as exactly that —
 * never as "safe". Actions: copy shareable link, CSV, printable report.
 */
export function RegimenPanel() {
  const slots = useExplorer((s) => s.slots);
  const neighbors = useExplorer((s) => s.neighbors);
  const byId = useExplorer((s) => s.byId);
  const view = useExplorer((s) => s.regimenView);
  const switchView = useExplorer((s) => s.setRegimenView);

  const picks = useMemo(() => [...new Set(pickedIds(slots))], [slots]);
  const pairs = useMemo(() => regimenPairs(picks, neighbors), [picks, neighbors]);

  if (picks.length < 2) return null;
  const name = (id: string) => byId.get(id)?.name ?? id;
  const found = pairs.filter((p) => p.info).length;
  const contraindicated = pairs.filter((p) => p.severity === 'contraindicated').length;
  const severe = pairs.filter((p) => p.severity === 'severe').length;

  const actions = [
    { label: 'Copy shareable link', icon: Link2, run: copyRegimenLink },
    { label: 'Download CSV', icon: Download, run: exportRegimenCsv },
    { label: 'Print report', icon: Printer, run: () => window.print() },
  ];

  return (
    <section
      aria-label="Regimen check"
      className="pointer-events-auto absolute top-3 right-3 z-10 flex max-h-[60%] w-80 flex-col overflow-hidden rounded-xl border bg-card/85 shadow-lg backdrop-blur-md"
    >
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b pr-1.5 pl-3">
        <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs font-semibold">Regimen check</p>
        <div className="ml-auto flex items-center gap-0.5">
          {(['list', 'matrix'] as const).map((v) => (
            <Tooltip key={v}>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant={view === v ? 'secondary' : 'ghost'}
                  aria-pressed={view === v}
                  aria-label={v === 'list' ? 'List view' : 'Matrix view'}
                  onClick={() => switchView(v)}
                >
                  {v === 'list' ? <List /> : <Grid3x3 />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{v === 'list' ? 'Pairs, worst first' : 'Pair matrix (heat-map)'}</TooltipContent>
            </Tooltip>
          ))}
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          {actions.map(({ label, icon: Icon, run }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label={label} onClick={run}>
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </header>
      <p className="border-b px-3 py-1 font-mono text-[10px] text-muted-foreground">
        {picks.length} meds · {found}/{pairs.length} pairs interact in this dataset
      </p>
      {contraindicated > 0 && (
        <p
          role="alert"
          className="flex items-center gap-2 border-b bg-[#ff3864]/15 px-3 py-1.5 text-[11px] font-medium text-[#ff6b8a]"
        >
          <OctagonAlert className="size-3.5 shrink-0" aria-hidden />
          {contraindicated} contraindicated combination{contraindicated > 1 ? 's' : ''} — kept with a
          documented override
        </p>
      )}
      {severe > 0 && (
        <p className="flex items-center gap-2 border-b bg-[#ff9e7a]/10 px-3 py-1.5 text-[11px] text-[#ffb59a]">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {severe} severe interaction{severe > 1 ? 's' : ''} — review before continuing
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'list' ? (
          <PairList pairs={pairs} name={name} />
        ) : (
          <PairMatrix picks={picks} pairs={pairs} name={name} />
        )}
      </div>
    </section>
  );
}

function PairList({ pairs, name }: { pairs: RegimenPair[]; name: (id: string) => string }) {
  const overrides = useExplorer((s) => s.overrides);
  const setHover = useExplorer((s) => s.setHover);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul>
      {pairs.map((p) => {
        const key = pairKey(p.a, p.b);
        const expanded = open === key;
        const override = overrides[key];
        return (
          <li key={key} className="border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={expanded}
              disabled={!p.info}
              onClick={() => {
                setOpen(expanded ? null : key);
                useExplorer.getState().setInspectPair([p.a, p.b]);
              }}
              onPointerEnter={() => setHover(p.b, 'list')}
              onPointerLeave={() => setHover(null, 'list')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60 disabled:cursor-default"
            >
              {p.severity ? (
                <SeverityChip severity={p.severity} compact />
              ) : (
                <span className="w-9 shrink-0 text-center font-mono text-[10px] text-muted-foreground">—</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {name(p.a)} + {name(p.b)}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {!p.loaded
                    ? 'loading…'
                    : p.info
                      ? kindLabel(p.info.kind)
                      : 'not found in this dataset (not a safety claim)'}
                </span>
              </span>
              {p.info && (
                <ChevronRight
                  className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                />
              )}
            </button>
            {override && (
              <p className="px-3 pb-2 text-[10px] text-muted-foreground">
                Overridden · {override.reason} · {new Date(override.at).toLocaleTimeString()}
              </p>
            )}
            {expanded && p.info && (
              <div className="px-3 pb-2.5 text-[11px] leading-relaxed">
                <p className="text-foreground/85">{p.info.mechanism}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Severity: {basisLabel(p.info.severity_basis)}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const SHORT = { contraindicated: 'CI', severe: 'SEV', moderate: 'MOD', mild: 'MILD' } as const;

/**
 * N×N heat-map: cell colour = severity of that pair (text label too, so
 * colour is never the only channel). Hover links to the graph; click pins
 * the pair in the inspector.
 */
function PairMatrix({
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
                          ? { background: `${color}cc`, color: '#0b0b12' }
                          : { boxShadow: 'inset 0 0 0 1px var(--border)', color: 'var(--muted-foreground)' }
                      }
                    >
                      {p?.severity ? SHORT[p.severity] : p?.loaded ? '·' : '…'}
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
