import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';

import { GRAPH_COLOR, SEVERITY_COLOR } from '@/shared/domain';

import type { SceneGraph } from './build';
import type { EdgeAttrs, NodeAttrs, RingData, View } from './types';

/** sigma reducers: derive every frame's look from the static graph + the current view. */
export function createReducers(graph: SceneGraph, view: View) {
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
      out.ringColor = GRAPH_COLOR.ring;
    }
    if (view.hover === node) {
      out.highlighted = true;
      out.hidden = false;
      out.zIndex = 4;
      out.size = (out.size ?? data.size) * 1.25 + 1;
      out.color = data.color;
      out.ringCi = data.ringCi;
      out.ringSevere = data.ringSevere;
      out.ringColor = inRegimen ? GRAPH_COLOR.ring : data.color;
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

  return { nodeReducer, edgeReducer };
}
