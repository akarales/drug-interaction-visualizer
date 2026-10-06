import { EdgeModeToggle, FamilyLegend, HoverReadout, ZoomControls, type GraphHandle } from '@/features/graph';

/** Everything drawn over the map's safe area: hover readout (top) and the controls bar (bottom). */
export function MapOverlays({ graph }: { graph: GraphHandle | null }) {
  return (
    <>
      <HoverReadout />
      <div
        data-map-controls
        className="pointer-events-auto absolute right-3 bottom-3 left-3 z-(--z-overlay) flex flex-wrap items-end justify-end gap-2"
      >
        <FamilyLegend />
        <EdgeModeToggle />
        <ZoomControls graph={graph} />
      </div>
    </>
  );
}
