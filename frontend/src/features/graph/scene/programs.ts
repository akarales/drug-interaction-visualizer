import { createNodeBorderProgram } from '@sigma/node-border';
import { createNodePiechartProgram } from '@sigma/node-piechart';
import { createNodeCompoundProgram, type NodeHoverDrawingFunction } from 'sigma/rendering';

import { GRAPH_COLOR, SEVERITY_COLOR } from '@/shared/domain';

import type { EdgeAttrs, NodeAttrs, RingData } from './types';

/** Outer share of a node's radius used by the severity ring. */
const RING_WIDTH = 0.34;

/**
 * Node = family-coloured core inside a severity ring. The ring is a pie
 * whose arcs are the drug's share of contraindicated and severe
 * interactions (the rest is transparent), so risky drugs read at a glance.
 * Pie underneath, then a border program with a transparent outer band and
 * a filled core on top.
 */
export const NodeRingProgram = createNodeCompoundProgram<NodeAttrs, EdgeAttrs>([
  createNodePiechartProgram<NodeAttrs, EdgeAttrs>({
    defaultColor: GRAPH_COLOR.background,
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

/** Hover/selection decoration: a ring, never text (names live in the lists). */
export const drawRing: NodeHoverDrawingFunction<NodeAttrs, EdgeAttrs> = (ctx, data) => {
  const r = data.size + 3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(data.x, data.y, r + 5, 0, Math.PI * 2);
  ctx.fillStyle = GRAPH_COLOR.halo;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(data.x, data.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = (data as RingData).ringColor ?? GRAPH_COLOR.ring;
  ctx.stroke();
  ctx.restore();
};
