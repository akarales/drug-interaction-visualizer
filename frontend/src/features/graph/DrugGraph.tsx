import { useEffect, useRef, type RefObject } from 'react';
import Sigma from 'sigma';
import { createEdgeCurveProgram } from '@sigma/edge-curve';

import type { DrugSummary } from '@/api/schemas';
import { useExplorer } from '@/state';

import { buildGraph } from './scene/build';
import { SAFE_PADDING, safeAreaCamera } from './scene/fit';
import { NodeRingProgram, drawRing } from './scene/programs';
import { createReducers } from './scene/reducers';
import { createSceneSync } from './scene/sync';
import { ANCHOR_PREFIX, type EdgeAttrs, type NodeAttrs, type View } from './scene/types';
import type { GraphHandle } from './types';

const HOVER_LEAVE_GRACE_MS = 90;
const ARROW_HEAD = { extremity: 'target' as const, lengthToThicknessRatio: 7, widenessToThicknessRatio: 4 };

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  drugs: readonly DrugSummary[];
  onReady?: (handle: GraphHandle | null) => void;
  /**
   * The part of the canvas not covered by panels. The canvas stays
   * full-bleed (it is the glass panels' backdrop) but the camera fits the
   * graph into this element; defaults to the whole canvas.
   */
  safeArea?: RefObject<HTMLElement | null>;
}

/**
 * WebGL drug map (sigma.js v3). All 1,701 drugs on a deterministic family
 * layout; edges exist only around the medications in the columns. The
 * React component renders once per dataset — hover and selection flow
 * store → reducers → `sigma.refresh`, never through React state.
 */
export function DrugGraph({ drugs, onReady, safeArea }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  const safeAreaRef = useRef(safeArea);
  useEffect(() => {
    safeAreaRef.current = safeArea;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || drugs.length === 0) return;

    const graph = buildGraph(drugs);
    const view: View = { hover: null, regimen: new Set(), lit: null, hideUnlit: false, family: null, summary: true };
    const { nodeReducer, edgeReducer } = createReducers(graph, view);

    const sigma = new Sigma(graph, container, {
      renderLabels: false,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      zIndex: true,
      defaultDrawNodeHover: drawRing,
      defaultNodeType: 'ring',
      nodeProgramClasses: { ring: NodeRingProgram },
      defaultEdgeType: 'curve',
      edgeProgramClasses: {
        curve: createEdgeCurveProgram<NodeAttrs, EdgeAttrs>(),
        // heads long enough to clear the regimen ring drawn around target nodes
        curvedArrow: createEdgeCurveProgram<NodeAttrs, EdgeAttrs>({ arrowHead: ARROW_HEAD }),
        curvedDoubleArrow: createEdgeCurveProgram<NodeAttrs, EdgeAttrs>({ arrowHead: { ...ARROW_HEAD, extremity: 'both' } }),
      },
      stagePadding: 48,
      allowInvalidContainer: true,
      minCameraRatio: 0.06,
      maxCameraRatio: 2.5,
      nodeReducer,
      edgeReducer,
    });

    const sync = createSceneSync(graph, view);
    sync(useExplorer.getState());
    sigma.refresh();
    const unsubscribe = useExplorer.subscribe((s, prev) => {
      if (
        s.slots === prev.slots &&
        s.active === prev.active &&
        s.neighbors === prev.neighbors &&
        s.severityFilter === prev.severityFilter &&
        s.familyFocus === prev.familyFocus &&
        s.edgeMode === prev.edgeMode &&
        s.hover === prev.hover
      ) {
        return;
      }
      const edgesChanged = sync(s);
      sigma.refresh(edgesChanged ? undefined : { skipIndexation: true });
    });

    // ---- pointer: hover with a leave grace so crossing gaps never flickers ----
    let leaveTimer = 0;
    sigma.on('enterNode', ({ node }) => {
      if (node.startsWith(ANCHOR_PREFIX)) return;
      window.clearTimeout(leaveTimer);
      container.style.cursor = 'pointer';
      useExplorer.getState().setHover(node, 'graph');
    });
    sigma.on('leaveNode', ({ node }) => {
      container.style.cursor = '';
      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(() => {
        const s = useExplorer.getState();
        if (s.hover === node && s.hoverSource === 'graph') s.setHover(null, 'graph');
      }, HOVER_LEAVE_GRACE_MS);
    });
    sigma.on('clickNode', ({ node, event }) => {
      if (node.startsWith(ANCHOR_PREFIX)) return;
      const s = useExplorer.getState();
      if (event.original.shiftKey) s.addSlot(node);
      else s.pick(s.active, node);
    });

    // ---- camera: fit into the safe area; refit when panels resize unless
    // the user has zoomed/panned since the last fit ----
    const duration = () => (prefersReducedMotion() ? 0 : 220);
    const camera = sigma.getCamera();
    let programmatic = false;
    let userMoved = false;
    camera.on('updated', () => {
      if (!programmatic) userMoved = true;
    });
    const fit = (animate: boolean) => {
      const safeEl = safeAreaRef.current?.current ?? container;
      if (!container.offsetWidth || !safeEl.offsetWidth) return;
      // keep the map controls bar (it wraps on narrow safe areas) clear of nodes
      const controls = safeEl.querySelector<HTMLElement>('[data-map-controls]')?.offsetHeight ?? 36;
      const pad = { ...SAFE_PADDING, bottom: controls + 24 };
      const state = safeAreaCamera(sigma, container.getBoundingClientRect(), safeEl.getBoundingClientRect(), pad);
      programmatic = true;
      const done = () => {
        programmatic = false;
        userMoved = false;
      };
      if (animate && duration() > 0) void camera.animate(state, { duration: duration() }).then(done);
      else {
        camera.setState(state);
        done();
      }
    };
    // (skipped while hidden, e.g. the app shell is display:none when printing)
    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
        sigma.resize();
        if (!userMoved) fit(false);
      });
    });
    resizeObserver.observe(container);
    const safeEl = safeAreaRef.current?.current;
    if (safeEl) resizeObserver.observe(safeEl);
    fit(false);

    onReadyRef.current?.({
      zoomIn: () => void camera.animatedZoom({ duration: duration() }),
      zoomOut: () => void camera.animatedUnzoom({ duration: duration() }),
      reset: () => fit(true),
    });

    return () => {
      window.clearTimeout(leaveTimer);
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      unsubscribe();
      onReadyRef.current?.(null);
      sigma.kill();
    };
  }, [drugs]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Drug interaction map. Drug names and selection are in the medication lists."
      className="absolute inset-0 z-(--z-graph)"
    />
  );
}
