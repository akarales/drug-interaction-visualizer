import { useEffect, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { ArrowLeft, ArrowRight, Command as CommandIcon, Keyboard, Stethoscope } from 'lucide-react';

import { fetchDrugs } from '@/api/client';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ShortcutsDialog } from '@/components/command/ShortcutsDialog';
import { DrugGraph, type GraphHandle } from '@/components/graph/DrugGraph';
import {
  EdgeModeToggle,
  FamilyLegend,
  HoverReadout,
  ZoomControls,
} from '@/components/graph/GraphOverlays';
import { Inspector } from '@/components/inspector/Inspector';
import { ContraindicationAlert } from '@/components/regimen/ContraindicationAlert';
import { MedicationColumns } from '@/components/regimen/MedicationColumns';
import { RegimenPanel } from '@/components/regimen/RegimenPanel';
import { RegimenReport } from '@/components/regimen/RegimenReport';
import { PatientHandout } from '@/components/handout/PatientHandout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MOD } from '@/lib/shortcuts';
import { readJson, writeJson } from '@/lib/storage';
import { useExplorer } from '@/state/explorer';
import { startUrlSync, useHistoryNav } from '@/state/history';

const LAYOUT_KEY = 'ddi.layout';

export default function App() {
  const drugs = useExplorer((s) => s.drugs);
  const stats = useExplorer((s) => s.stats);
  const printJob = useExplorer((s) => s.printJob);
  const [graph, setGraph] = useState<GraphHandle | null>(null);
  const graphRef = useRef<GraphHandle | null>(null);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  const [savedLayout] = useState(() => readJson<Record<string, number> | undefined>(LAYOUT_KEY, undefined));
  const canBack = useHistoryNav((s) => s.canBack);
  const canForward = useHistoryNav((s) => s.canForward);

  useEffect(() => {
    const controller = new AbortController();
    let stopUrlSync: (() => void) | undefined;
    fetchDrugs(controller.signal)
      .then((body) => {
        useExplorer.getState().setDataset(body.drugs, body.stats);
        // ?meds=… can only be restored once drug ids are known
        stopUrlSync = startUrlSync();
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          toast.error('Failed to load dataset', { description: String(err) });
      });
    return () => {
      controller.abort();
      stopUrlSync?.();
    };
  }, []);

  // global keys (see lib/shortcuts.ts for the documented map)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useExplorer.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]');
      const dialogOpen = document.querySelector('[role="dialog"], [role="alertdialog"]');
      if (typing || dialogOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case '/': {
          e.preventDefault();
          document.querySelector<HTMLInputElement>(`[data-col-search="${s.active}"]`)?.focus();
          break;
        }
        case '?':
          s.setHelpOpen(true);
          break;
        case 'e':
        case 'E':
          s.setEdgeMode(s.edgeMode === 'summary' ? 'all' : 'summary');
          break;
        case 'm':
        case 'M':
          s.setRegimenView(s.regimenView === 'list' ? 'matrix' : 'list');
          break;
        case 'f':
        case 'F':
          graphRef.current?.reset();
          break;
        case 'Escape':
          s.escape();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground print:hidden">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
          <div className="flex items-center gap-0.5">
            {[
              { label: 'Back', hint: 'Previous regimen (Alt+←)', icon: ArrowLeft, enabled: canBack, run: () => window.history.back() },
              { label: 'Forward', hint: 'Next regimen (Alt+→)', icon: ArrowRight, enabled: canForward, run: () => window.history.forward() },
            ].map(({ label, hint, icon: Icon, enabled, run }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Button size="icon-xs" variant="ghost" aria-label={label} disabled={!enabled} onClick={run}>
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <Stethoscope className="size-4 shrink-0 text-primary" aria-hidden />
          <h1 className="truncate text-sm font-semibold">Drug Interaction Visualizer</h1>
          {stats && (
            <Badge variant="secondary" className="hidden font-mono text-[10px] md:inline-flex">
              {stats.drugs.toLocaleString()} drugs · {stats.interactions.toLocaleString()}{' '}
              interactions
            </Badge>
          )}
          <button
            type="button"
            onClick={() => useExplorer.getState().setPaletteOpen(true)}
            className="ml-auto flex h-7 w-64 shrink-0 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Open command palette"
          >
            <CommandIcon className="size-3.5" />
            Search drugs &amp; commands…
            <kbd className="ml-auto rounded bg-background/70 px-1.5 font-mono text-[10px]">{MOD} K</kbd>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Keyboard shortcuts"
                onClick={() => useExplorer.getState().setHelpOpen(true)}
              >
                <Keyboard />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
          <span className="hidden truncate text-[11px] text-muted-foreground 2xl:inline">
            Demo data · editorial severity · not medical advice
          </span>
        </header>

        <ResizablePanelGroup
          id="workspace"
          orientation="horizontal"
          defaultLayout={savedLayout}
          onLayoutChanged={(layout) => writeJson(LAYOUT_KEY, layout)}
          className="min-h-0 flex-1"
        >
          <ResizablePanel id="graph" minSize="40">
            <section className="relative h-full overflow-hidden">
              {drugs.length === 0 ? (
                <div className="absolute inset-0 p-6">
                  <Skeleton className="h-full w-full rounded-xl" />
                </div>
              ) : (
                <>
                  <DrugGraph drugs={drugs} onReady={setGraph} />
                  <MedicationColumns />
                  <RegimenPanel />
                  <HoverReadout />
                  <div className="pointer-events-auto absolute right-3 bottom-3 left-3 z-10 flex items-end justify-end gap-2">
                    <FamilyLegend />
                    <EdgeModeToggle />
                    <ZoomControls graph={graph} />
                  </div>
                </>
              )}
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize inspector" />
          <ResizablePanel id="inspector" defaultSize={400} minSize={320} maxSize={680}>
            <aside aria-label="Inspector" className="h-full">
              <Inspector />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <ContraindicationAlert />
        <CommandPalette graph={graph} />
        <ShortcutsDialog />
        <Toaster position="bottom-center" richColors />
      </div>
      {printJob?.kind === 'handout' ? <PatientHandout job={printJob} /> : <RegimenReport />}
    </TooltipProvider>
  );
}
