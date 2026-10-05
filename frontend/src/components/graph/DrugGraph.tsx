import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import { createEdgeCurveProgram } from '@sigma/edge-curve';
import { createNodeBorderProgram } from '@sigma/node-border';
import { createNodePiechartProgram } from '@sigma/node-piechart';
import { createNodeCompoundProgram, type NodeHoverDrawingFunction } from 'sigma/rendering';
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';

import type { DrugSummary } from '@/api/types';
import {
  FAMILIES,
  FAMILY_COLOR,
  SEVERITY_COLOR,
  asSeverity,
  mixHex,
  type Family,
  type Severity,
} from '@/lib/domain';
import { ringsLayout } from '@/lib/layout';
import { focusDrugId, pairInfo, pickedIds, useExplorer } from '@/state/explorer';

/** Approximates the theme's dark --background for colour blending. */
const BG = '#1d1c2c';
const HOVER_LEAVE_GRACE_MS = 90;

/** Outer share of a node's radius used by the severity ring. */
const RING_WIDTH = 0.34;
const ANCHOR_PREFIX = '__family:';

/**
 * Node = family-coloured core inside a severity ring. The ring is a pie
 * whose arcs are the drug's share of contraindicated and severe
 * interactions (the rest is transparent), so risky drugs read at a glance.
 * Pie underneath, then a border program with a transparent outer band and
 * a filled core on top.
 */
const NodeRingProgram = createNodeCompoundProgram<NodeAttrs, EdgeAttrs>([
  createNodePiechartProgram<NodeAttrs, EdgeAttrs>({
    defaultColor: BG,
    slices: [
      { color: { value: SEVERITY_COLOR.contraindicated }, value: { attribute: 'ringCi' } },
      { color: { value: SEVERITY_COLOR.severe }, value: { attribute: 'ringSevere' } },
      { color: { transparent: true }, value: { attribute: 'ringRest' } },
    ],
  }),
  createNodeBorderProgram<NodeAttrs, EdgeAttrs>({
    borders: [
      { size: { value: RING_WIDTH, mode: 'relative' }, color: { transparent: true } },
      { size: { fill: true }, color: { attribute: 'color' } },
    ],
  }),
]);

const FAN_STYLE: Record<Severity, { size: number; color: string }> = {
  contraindicated: { size: 1.6, color: SEVERITY_COLOR.contraindicated },
  severe: { size: 1, color: mixHex(SEVERITY_COLOR.severe, BG, 0.7) },
  moderate: { size: 0.5, color: mixHex(SEVERITY_COLOR.moderate, BG, 0.22) },
  mild: { size: 0.6, color: mixHex(SEVERITY_COLOR.mild, BG, 0.5) },
};

interface NodeAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  dimColor: string;
  family: Family;
  label: string;
  type: 'ring';
  /** invisible family centroid that summary arcs attach to */
  anchor: boolean;
  ringCi: number;
  ringSevere: number;
  ringRest: number;
}

interface EdgeAttrs {
  size: number;
  color: string;
  severity: Severity;
  regimen: boolean;
  /** an individual focus→neighbour edge (hidden in summary mode unless severe) */
  fan: boolean;
  curvature: number;
}

interface View {
  hover: string | null;
  regimen: ReadonlySet<string>;
  /** nodes kept bright (active drug's neighbours + regimen); null = all */
  lit: ReadonlySet<string> | null;
  hideUnlit: boolean;
  family: Family | null;
  summary: boolean;
}

type RingData = { ringColor?: string; ringCi?: number; ringSevere?: number };

/** Hover/selection decoration: a ring, never text (names live in the lists). */
const drawRing: NodeHoverDrawingFunction<NodeAttrs, EdgeAttrs> = (ctx, data) => {
  const r = data.size + 3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(data.x, data.y, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(data.x, data.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = (data as RingData).ringColor ?? '#ffffff';
  ctx.stroke();
  ctx.restore();
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface GraphHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

interface Props {
  drugs: readonly DrugSummary[];
  onReady?: (handle: GraphHandle | null) => void;
}

/**
 * WebGL drug map (sigma.js v3). All 1,701 drugs on a deterministic family
 * layout; edges exist only around the medications in the columns. The
 * React component renders once per dataset — hover and selection flow
 * store → reducers → `sigma.refresh`, never through React state.
 */
export function DrugGraph({ drugs, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || drugs.length === 0) return;

    // multi: a family can have two summary arcs (severe + other) to one anchor
    const graph = new Graph<NodeAttrs, EdgeAttrs>({ type: 'undirected', multi: true });
    const byId = new Map(drugs.map((d) => [d.id, d]));
    const layout = ringsLayout(drugs);
    for (const [id, p] of layout) {
      const [ci, severe, moderate, mild] = byId.get(id)?.severity_mix ?? [0, 0, 0, 0];
      graph.addNode(id, {
        x: p.x,
        y: p.y,
        size: p.size,
        color: FAMILY_COLOR[p.family],
        dimColor: mixHex(FAMILY_COLOR[p.family], BG, 0.16),
        family: p.family,
        label: byId.get(id)?.name ?? id,
        type: 'ring',
        anchor: false,
        ringCi: ci,
        ringSevere: severe,
        ringRest: moderate + mild + (ci + severe + moderate + mild === 0 ? 1 : 0),
      });
    }
    // family centroids: summary arcs bundle a drug's non-severe interactions per family
    for (const family of FAMILIES) {
      const members = [...layout.values()].filter((p) => p.family === family);
      if (members.length === 0) continue;
      graph.addNode(`${ANCHOR_PREFIX}${family}`, {
        x: members.reduce((sum, p) => sum + p.x, 0) / members.length,
        y: members.reduce((sum, p) => sum + p.y, 0) / members.length,
        size: 0.5,
        color: BG,
        dimColor: BG,
        family,
        label: '',
        type: 'ring',
        anchor: true,
        ringCi: 0,
        ringSevere: 0,
        ringRest: 1,
      });
    }

    const view: View = {
      hover: null,
      regimen: new Set(),
      lit: null,
      hideUnlit: false,
      family: null,
      summary: true,
    };

    const nodeReducer = (node: string, data: NodeAttrs): Partial<NodeDisplayData> => {
      if (data.anchor) return { ...data, label: null, zIndex: 0 };
      const out: Partial<NodeDisplayData> & RingData = { ...data, label: null, zIndex: 1 };
      const inRegimen = view.regimen.has(node);
      const unlit =
        (view.lit !== null && !view.lit.has(node) && !inRegimen) ||
        (view.family !== null && data.family !== view.family && !inRegimen);
      if (unlit) {
        out.color = data.dimColor;
        out.ringCi = 0;
        out.ringSevere = 0;
        out.zIndex = 0;
        if (view.hideUnlit) out.hidden = true;
      }
      if (inRegimen) {
        out.highlighted = true;
        out.zIndex = 3;
        out.size = data.size * 1.35 + 1.5;
        out.ringColor = '#ffffff';
      }
      if (view.hover === node) {
        out.highlighted = true;
        out.hidden = false;
        out.zIndex = 4;
        out.size = (out.size ?? data.size) * 1.25 + 1;
        out.color = data.color;
        out.ringCi = data.ringCi;
        out.ringSevere = data.ringSevere;
        out.ringColor = inRegimen ? '#ffffff' : data.color;
      }
      return out;
    };

    const edgeReducer = (edge: string, data: EdgeAttrs): Partial<EdgeDisplayData> => {
      const out: Partial<EdgeDisplayData> = { ...data, zIndex: data.regimen ? 3 : 1 };
      const hovered = view.hover !== null && graph.hasExtremity(edge, view.hover);
      if (hovered) {
        out.color = SEVERITY_COLOR[data.severity];
        out.size = Math.max(data.size * 2.2, 1.8);
        out.zIndex = 4;
      } else if (view.summary && data.fan && data.severity !== 'contraindicated') {
        // summary mode: represented by the per-family arcs; shown on hover
        out.hidden = true;
      }
      return out;
    };

    const sigma = new Sigma(graph, container, {
      renderLabels: false,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      zIndex: true,
      defaultDrawNodeHover: drawRing,
      defaultNodeType: 'ring',
      nodeProgramClasses: { ring: NodeRingProgram },
      defaultEdgeType: 'curve',
      edgeProgramClasses: { curve: createEdgeCurveProgram<NodeAttrs, EdgeAttrs>() },
      stagePadding: 48,
      allowInvalidContainer: true,
      minCameraRatio: 0.06,
      maxCameraRatio: 2.5,
      nodeReducer,
      edgeReducer,
    });

    // ---- store → view (outside React) ----
    let edgeSignature = '';
    const sync = () => {
      const s = useExplorer.getState();
      const activeId = focusDrugId(s);
      const picks = pickedIds(s.slots);
      const activeMap = activeId ? s.neighbors[activeId] : undefined;

      view.hover = s.hover;
      view.regimen = new Set(picks);
      view.family = s.familyFocus;
      view.summary = s.edgeMode === 'summary';
      view.hideUnlit = Boolean(s.severityFilter && activeMap);
      view.lit = activeMap
        ? new Set(
            [...activeMap.values()]
              .filter((n) => !s.severityFilter || n.severity === s.severityFilter)
              .map((n) => n.id),
          )
        : null;

      const loaded = picks.filter((id) => s.neighbors[id]).join(',');
      const signature = `${activeId}|${picks.join(',')}|${loaded}|${s.severityFilter}|${s.edgeMode}`;
      if (signature === edgeSignature) return false;
      edgeSignature = signature;

      graph.clearEdges();
      const edges = new Map<string, [string, string, EdgeAttrs]>();
      const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      if (activeId && activeMap) {
        // per family: [severe count, other count] for the summary arcs
        const familyCounts = new Map<Family, [number, number]>();
        for (const n of activeMap.values()) {
          const severity = asSeverity(n.severity);
          if (s.severityFilter && severity !== s.severityFilter) continue;
          if (!graph.hasNode(n.id)) continue;
          edges.set(key(activeId, n.id), [
            activeId,
            n.id,
            { ...FAN_STYLE[severity], severity, regimen: false, fan: true, curvature: 0.18 },
          ]);
          if (severity !== 'contraindicated') {
            const family = graph.getNodeAttribute(n.id, 'family');
            const c = familyCounts.get(family) ?? [0, 0];
            c[severity === 'severe' ? 0 : 1] += 1;
            familyCounts.set(family, c);
          }
        }
        if (s.edgeMode === 'summary' && familyCounts.size > 0) {
          const max = Math.max(...[...familyCounts.values()].flat());
          const width = (count: number) => 1.5 + 9 * Math.sqrt(count / max);
          for (const [family, [severe, other]] of familyCounts) {
            const anchor = `${ANCHOR_PREFIX}${family}`;
            if (severe > 0)
              edges.set(`sum-severe|${anchor}`, [
                activeId,
                anchor,
                {
                  size: width(severe),
                  color: mixHex(SEVERITY_COLOR.severe, BG, 0.6),
                  severity: 'severe',
                  regimen: false,
                  fan: false,
                  curvature: 0.36,
                },
              ]);
            if (other > 0)
              edges.set(`sum-other|${anchor}`, [
                activeId,
                anchor,
                {
                  size: width(other),
                  color: mixHex(FAMILY_COLOR[family], BG, 0.38),
                  severity: 'moderate',
                  regimen: false,
                  fan: false,
                  curvature: 0.16,
                },
              ]);
          }
        }
      }
      for (let i = 0; i < picks.length; i++) {
        for (let j = i + 1; j < picks.length; j++) {
          const { info } = pairInfo(s.neighbors, picks[i], picks[j]);
          if (!info) continue;
          const severity = asSeverity(info.severity);
          edges.set(key(picks[i], picks[j]), [
            picks[i],
            picks[j],
            { size: 3.2, color: SEVERITY_COLOR[severity], severity, regimen: true, fan: false, curvature: 0.1 },
          ]);
        }
      }
      for (const [k, [a, b, attrs]] of edges) graph.addEdgeWithKey(k, a, b, attrs);
      return true;
    };

    sync();
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
      const edgesChanged = sync();
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

    // the inspector is resizable: keep the WebGL viewport in sync
    // (skipped while hidden, e.g. the app shell is display:none when printing)
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) sigma.resize();
    });
    resizeObserver.observe(container);

    const duration = () => (prefersReducedMotion() ? 0 : 220);
    const camera = sigma.getCamera();
    onReadyRef.current?.({
      zoomIn: () => void camera.animatedZoom({ duration: duration() }),
      zoomOut: () => void camera.animatedUnzoom({ duration: duration() }),
      reset: () => void camera.animatedReset({ duration: duration() }),
    });

    return () => {
      window.clearTimeout(leaveTimer);
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
      className="absolute inset-y-0 right-0 left-0 lg:left-[272px]"
    />
  );
}
