import Graph from 'graphology';

import type { DrugSummary } from '@/api/schemas';
import { FAMILIES, FAMILY_COLOR, GRAPH_COLOR, mixHex } from '@/shared/domain';

import { ringsLayout } from './layout';
import { ANCHOR_PREFIX, type EdgeAttrs, type NodeAttrs } from './types';

export type SceneGraph = Graph<NodeAttrs, EdgeAttrs>;

/** Every drug as a ring node on the deterministic layout, plus one invisible anchor per family. */
export function buildGraph(drugs: readonly DrugSummary[]): SceneGraph {
  const BG = GRAPH_COLOR.background;
  // multi: a family can have two summary arcs (severe + other) to one anchor
  const graph: SceneGraph = new Graph<NodeAttrs, EdgeAttrs>({ type: 'undirected', multi: true });
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
  return graph;
}
