import { Download, Grid3x3, Link2, List, OctagonAlert, Printer, ShieldAlert, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CollapseToggle } from '@/shared/components/CollapseToggle';
import { useCollapsible } from '@/shared/hooks/useCollapsible';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

import { useRegimenPairs } from '../hooks/useRegimenPairs';
import { copyRegimenLink, exportRegimenCsv } from '../lib/actions';
import { PairList } from './PairList';
import { PairMatrix } from './PairMatrix';

const ACTIONS = [
  { label: 'Copy shareable link', icon: Link2, run: copyRegimenLink },
  { label: 'Download CSV', icon: Download, run: exportRegimenCsv },
  { label: 'Print report', icon: Printer, run: () => window.print() },
];

/**
 * Every pair in the regimen, worst first, as a list or an N×N heat-map
 * matrix. Absence of a pair in the dataset is shown as exactly that —
 * never as "safe". Actions: copy shareable link, CSV, printable report.
 */
export function RegimenPanel() {
  const view = useExplorer((s) => s.regimenView);
  const switchView = useExplorer((s) => s.setRegimenView);
  const name = useDrugName();
  const { picks, pairs } = useRegimenPairs();
  const [open, toggle] = useCollapsible('ddi.section.regimen');

  if (picks.length < 2) return null;
  const found = pairs.filter((p) => p.info).length;
  const contraindicated = pairs.filter((p) => p.severity === 'contraindicated').length;
  const severe = pairs.filter((p) => p.severity === 'severe').length;

  return (
    <section aria-label="Regimen check" className="flex max-h-[48%] shrink-0 flex-col overflow-hidden border-b">
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b pr-1.5 pl-3">
        <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-xs font-semibold">Regimen check</h2>
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
          {ACTIONS.map(({ label, icon: Icon, run }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label={label} onClick={run}>
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
          <CollapseToggle open={open} onToggle={toggle} label="regimen check" />
        </div>
      </header>
      <p className="border-b px-3 py-1 font-mono text-[11px] text-muted-foreground">
        {picks.length} meds · {found}/{pairs.length} pairs interact in this dataset
      </p>
      {contraindicated > 0 && (
        <p
          role="alert"
          className="flex items-center gap-2 border-b bg-(--sev-contraindicated)/15 px-3 py-1.5 text-[11px] font-medium text-(--sev-contraindicated-text)"
        >
          <OctagonAlert className="size-3.5 shrink-0" aria-hidden />
          {contraindicated} contraindicated combination{contraindicated > 1 ? 's' : ''} — kept with a
          documented override
        </p>
      )}
      {severe > 0 && (
        <p className="flex items-center gap-2 border-b bg-(--sev-severe)/10 px-3 py-1.5 text-[11px] text-(--sev-severe-text)">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {severe} severe interaction{severe > 1 ? 's' : ''} — review before continuing
        </p>
      )}
      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'list' ? (
            <PairList pairs={pairs} name={name} />
          ) : (
            <PairMatrix picks={picks} pairs={pairs} name={name} />
          )}
        </div>
      )}
    </section>
  );
}
