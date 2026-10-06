import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'sonner';

import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette, ShortcutsDialog } from '@/features/command';
import { PatientHandout } from '@/features/explain';
import type { GraphHandle } from '@/features/graph';
import { ContraindicationAlert, OpenRegimenDialog, RegimenReport, SaveRegimenDialog } from '@/features/regimen';
import { LIVE_REGION_ID } from '@/shared/announce';
import { DESKTOP_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useExplorer } from '@/state';

import { AppHeader } from './AppHeader';
import { Workspace, type Drawer } from './layout/Workspace';
import { useDataset } from './useDataset';
import { useGlobalKeys } from './useGlobalKeys';

/** App shell: header, workspace (map + panels), dialogs, print views. */
export default function App() {
  const printJob = useExplorer((s) => s.printJob);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [graph, setGraph] = useState<GraphHandle | null>(null);
  const graphRef = useRef<GraphHandle | null>(null);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useDataset();
  useGlobalKeys(graphRef);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground print:hidden">
        <AppHeader onDrawer={desktop ? undefined : setDrawer} />
        <Workspace desktop={desktop} graph={graph} onGraph={setGraph} drawer={drawer} onDrawer={setDrawer} />
        <ContraindicationAlert />
        <CommandPalette graph={graph} />
        <ShortcutsDialog />
        <SaveRegimenDialog />
        <OpenRegimenDialog />
        <Toaster position="bottom-center" richColors />
        <p id={LIVE_REGION_ID} aria-live="polite" className="sr-only" />
      </div>
      {printJob?.kind === 'handout' ? <PatientHandout job={printJob} /> : <RegimenReport />}
    </TooltipProvider>
  );
}
