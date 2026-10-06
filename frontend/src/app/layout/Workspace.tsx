import { useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { usePanelRef } from 'react-resizable-panels';

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DrugGraph, type GraphHandle } from '@/features/graph';
import { FloatingCard, MedicationRail } from '@/features/regimen';
import { readJson, writeJson } from '@/shared/storage';
import { useExplorer } from '@/state';

import { MapOverlays } from './MapOverlays';
import { RightColumn } from './RightColumn';

const LAYOUT_KEY = 'ddi.layout.v4';

/** Open drawers with focus on the drawer itself (not its first button, which would pop a tooltip). */
const focusSheet = (e: Event) => {
  e.preventDefault();
  (e.currentTarget as HTMLElement | null)?.focus();
};

export type Drawer = 'rail' | 'right' | null;

/**
 * The workspace. Desktop: the map is full-bleed (the glass panels' backdrop)
 * under a resizable rail | centre | right column; the centre is the map's
 * safe area — the camera fits nodes into it, so a panel never hides a node.
 * Mobile (< 1024 px): map only; rail and right column open as drawers.
 */
export function Workspace({
  desktop,
  graph,
  onGraph,
  drawer,
  onDrawer,
}: {
  desktop: boolean;
  graph: GraphHandle | null;
  onGraph: (g: GraphHandle | null) => void;
  drawer: Drawer;
  onDrawer: (d: Drawer) => void;
}) {
  const drugs = useExplorer((s) => s.drugs);
  const safeArea = useRef<HTMLDivElement | null>(null);
  const railRef = usePanelRef();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [savedLayout] = useState(() => readJson<Record<string, number> | undefined>(LAYOUT_KEY, undefined));

  const railToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={railCollapsed ? 'Show medications' : 'Hide medications'}
          onClick={() => (railCollapsed ? railRef.current?.expand() : railRef.current?.collapse())}
        >
          {railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{railCollapsed ? 'Show medications' : 'Hide medications'}</TooltipContent>
    </Tooltip>
  );

  return (
    <div data-float-bounds className="relative min-h-0 flex-1 overflow-hidden">
      {drugs.length > 0 && <DrugGraph drugs={drugs} onReady={onGraph} safeArea={desktop ? safeArea : undefined} />}

      {desktop ? (
        <ResizablePanelGroup
          id="workspace-v4"
          orientation="horizontal"
          defaultLayout={savedLayout}
          onLayoutChanged={(layout) => writeJson(LAYOUT_KEY, layout)}
          className="pointer-events-none absolute inset-0 z-(--z-panel)"
        >
          <ResizablePanel
            id="rail"
            panelRef={railRef}
            defaultSize={320}
            minSize={240}
            maxSize={420}
            collapsible
            collapsedSize={0}
            onResize={(size) => setRailCollapsed(size.inPixels < 1)}
          >
            <aside
              data-region="rail"
              tabIndex={-1}
              aria-label="Medications"
              className="glass pointer-events-auto h-full border-r outline-none"
            >
              <MedicationRail headerAction={railToggle} />
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize medications" className="pointer-events-auto" />
          <ResizablePanel id="center" minSize={280}>
            <section
              ref={safeArea}
              data-region="map"
              tabIndex={-1}
              aria-label="Drug map"
              className="relative h-full outline-none"
            >
              {railCollapsed && (
                <div className="glass pointer-events-auto absolute top-3 left-3 z-(--z-overlay) rounded-lg border p-0.5">
                  {railToggle}
                </div>
              )}
              <MapOverlays graph={graph} />
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize inspector" className="pointer-events-auto" />
          <ResizablePanel id="right" defaultSize={400} minSize={320} maxSize={680}>
            <aside
              data-region="right"
              tabIndex={-1}
              aria-label="Inspector"
              className="glass pointer-events-auto h-full border-l outline-none"
            >
              <RightColumn />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          <section data-region="map" tabIndex={-1} aria-label="Drug map" className="pointer-events-none absolute inset-0 outline-none">
            <MapOverlays graph={graph} />
          </section>
          <Sheet open={drawer === 'rail'} onOpenChange={(open) => onDrawer(open ? 'rail' : null)}>
            <SheetContent side="left" onOpenAutoFocus={focusSheet} className="w-[min(340px,90vw)] gap-0 p-0 pt-10">
              <SheetHeader className="sr-only">
                <SheetTitle>Medications</SheetTitle>
                <SheetDescription>Build and reorder the regimen</SheetDescription>
              </SheetHeader>
              <MedicationRail />
            </SheetContent>
          </Sheet>
          <Sheet open={drawer === 'right'} onOpenChange={(open) => onDrawer(open ? 'right' : null)}>
            <SheetContent side="right" onOpenAutoFocus={focusSheet} className="w-[min(420px,92vw)] gap-0 p-0 pt-10">
              <SheetHeader className="sr-only">
                <SheetTitle>Regimen check and details</SheetTitle>
                <SheetDescription>Pairs, interactions and AI explanations</SheetDescription>
              </SheetHeader>
              <RightColumn />
            </SheetContent>
          </Sheet>
        </>
      )}

      {desktop && <FloatingCard />}
    </div>
  );
}
