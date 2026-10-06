import { FAMILY_COLOR, GRAPH_COLOR, SEVERITY_COLOR, asSeverity, mixHex, type Family, type Severity } from '@/shared/domain';
import { focusDrugId, pairInfo, pickedIds, pairKey, type Store } from '@/state';

import type { SceneGraph } from './build';
import { ANCHOR_PREFIX, type EdgeAttrs, type View } from './types';

const BG = GRAPH_COLOR.background;

const FAN_STYLE: Record<Severity, { size: number; color: string }> = {
  contraindicated: { size: 1.6, color: SEVERITY_COLOR.contraindicated },
  severe: { size: 1, color: mixHex(SEVERITY_COLOR.severe, BG, 0.7) },
  moderate: { size: 0.5, color: mixHex(SEVERITY_COLOR.moderate, BG, 0.22) },
  mild: { size: 0.6, color: mixHex(SEVERITY_COLOR.mild, BG, 0.5) },
};

type Edges = Map<string, [string, string, EdgeAttrs]>;

/** Fan edges from the focused drug + per-family summary arcs. */
function focusEdges(graph: SceneGraph, s: Store, activeId: string, edges: Edges): void {
  const activeMap = s.neighbors[activeId];
  if (!activeMap) return;
  // per family: [severe count, other count] for the summary arcs
  const familyCounts = new Map<Family, [number, number]>();
  for (const n of activeMap.values()) {
    const severity = asSeverity(n.severity);
    if (s.severityFilter && severity !== s.severityFilter) continue;
    if (!graph.hasNode(n.id)) continue;
    edges.set(pairKey(activeId, n.id), [
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
  if (s.edgeMode !== 'summary' || familyCounts.size === 0) return;
  const max = Math.max(...[...familyCounts.values()].flat());
  const width = (count: number) => 1.5 + 9 * Math.sqrt(count / max);
  for (const [family, [severe, other]] of familyCounts) {
    const anchor = `${ANCHOR_PREFIX}${family}`;
    const arc = (size: number, color: string, severity: Severity, curvature: number): EdgeAttrs => ({
      size,
      color,
      severity,
      regimen: false,
      fan: false,
      curvature,
    });
    if (severe > 0)
      edges.set(`sum-severe|${anchor}`, [activeId, anchor, arc(width(severe), mixHex(SEVERITY_COLOR.severe, BG, 0.6), 'severe', 0.36)]);
    if (other > 0)
      edges.set(`sum-other|${anchor}`, [activeId, anchor, arc(width(other), mixHex(FAMILY_COLOR[family], BG, 0.38), 'moderate', 0.16)]);
  }
}

/** Bold edges between every interacting pair of the regimen. */
function regimenEdges(s: Store, picks: readonly string[], edges: Edges): void {
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const { info } = pairInfo(s.neighbors, picks[i], picks[j]);
      if (!info) continue;
      const severity = asSeverity(info.severity);
      // FDA direction: draw precipitant → object (double-headed when both ways)
      const roles = info.roles;
      const precipitant = roles?.pattern === 'directed' ? roles.links[0]?.precipitant : undefined;
      const [source, target] = precipitant === picks[j] ? [picks[j], picks[i]] : [picks[i], picks[j]];
      const type = !roles ? 'curve' : roles.pattern === 'directed' ? 'curvedArrow' : 'curvedDoubleArrow';
      edges.set(pairKey(picks[i], picks[j]), [
        source,
        target,
        { size: 3.2, color: SEVERITY_COLOR[severity], severity, regimen: true, fan: false, curvature: 0.1, type },
      ]);
    }
  }
}

/**
 * store → view (outside React). Returns `sync(state)`: updates the view the
 * reducers read and rebuilds edges only when their inputs changed
 * (returns true then, so the caller re-indexes).
 */
export function createSceneSync(graph: SceneGraph, view: View) {
  let edgeSignature = '';
  return (s: Store): boolean => {
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
    const edges: Edges = new Map();
    if (activeId) focusEdges(graph, s, activeId, edges);
    regimenEdges(s, picks, edges);
    for (const [k, [a, b, attrs]] of edges) graph.addEdgeWithKey(k, a, b, attrs);
    return true;
  };
}
