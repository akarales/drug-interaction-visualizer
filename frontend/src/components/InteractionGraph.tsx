import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

import type { GraphData, GraphNode } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize2, Minus, Plus } from 'lucide-react';

interface Props {
  data: GraphData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** severity dim-filter from the Filters panel ('' = show all) */
  severityFilter: string;
}

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  severity: string;
  gradientId: string;
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  category: string;
  degree: number;
}

/** Number of ticks to run synchronously before first paint. */
const PREWARM_TICKS = 300;

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim() || '#888';
  return {
    chart: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map(read),
    severe: read('--destructive'),
    moderate: read('--muted-foreground'),
    mild: read('--border'),
    label: read('--foreground'),
    ring: read('--ring'),
    nodeStroke: read('--card'),
    card: read('--card'),
    primary: read('--primary'),
  };
}

function categoryIndex(category: string): number {
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 5;
}

/** phyllotaxis spiral — deterministic, uniform, no overlap at t=0 */
function phyllotaxis(i: number, scale = 24): { x: number; y: number } {
  const r = scale * Math.sqrt(i + 0.5);
  const a = i * 2.399963; // golden angle
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

const SEVERITY_WIDTH: Record<string, number> = {
  severe: 2.6,
  moderate: 1.3,
  mild: 0.7,
};

/**
 * D3 owns the SVG; React renders the container. Stabilization: node
 * positions initialize on a phyllotaxis spiral and the simulation is
 * pre-warmed 300 ticks synchronously — the user sees a settled graph
 * bloom in, never the physics chaos. Colors come from the active theme's
 * CSS variables (tweakcn-swap safe). Hover dims non-neighbors for
 * instant neighborhood reading. Ego views render center-incident edges
 * only (hub egos have tens of thousands of induced edges).
 */
export function InteractionGraph({ data, selectedId, onSelect, severityFilter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ width: 960, height: 600 });
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const [focused] = useState<string | null>(data.center ?? null);
  const colors = useMemo(() => themeColors(), [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { width, height } = size;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', null).attr('width', width).attr('height', height);

    const egoCenter = data.center ?? null;
    const edges = egoCenter
      ? data.edges.filter((e) => e.source === egoCenter || e.target === egoCenter)
      : data.edges;

    const nodes: SimNode[] = data.nodes.map((node, i) => {
      const { x, y } = phyllotaxis(i, Math.min(width, height) / 22);
      return { ...node, x: width / 2 + x, y: height / 2 + y };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = edges
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        severity: edge.severity,
        gradientId: '',
      }))
      .filter((link) => byId.has(String(link.source)) && byId.has(String(link.target)));

    // gradient defs: one per edge, node color → node color
    const defs = svg.append('defs');
    for (const link of links) {
      const src = byId.get(String(link.source));
      const tgt = byId.get(String(link.target));
      if (!src || !tgt) continue;
      const gid = `grad-${src.id}-${tgt.id}`.replace(/[^a-zA-Z0-9-]/g, '');
      link.gradientId = gid;
      const grad = defs.append('linearGradient').attr('id', gid);
      grad
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', colors.chart[categoryIndex(src.category)] ?? '#888');
      grad
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', colors.chart[categoryIndex(tgt.category)] ?? '#888');
    }

    const container = svg.append('g');
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 8])
      .on('zoom', (event) => container.attr('transform', event.transform));
    zoomRef.current = zoom;
    svg.call(zoom);

    const maxDegree = Math.max(...nodes.map((n) => n.degree), 1);
    const nodeRadius = (d: SimNode) => 4 + 12 * (d.degree / maxDegree);

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .stop()
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance(Math.min(width, height) / 10),
      )
      .force('charge', d3.forceManyBody().strength(-110))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>((n) => nodeRadius(n) + 2));

    // PRE-WARM: run the physics synchronously — no chaos on screen
    for (let i = 0; i < PREWARM_TICKS; i++) simulation.tick();
    simulation.alpha(0.15).alphaDecay(0.05).restart();

    // links (curved for elegance)
    const link = container
      .append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => `url(#${d.gradientId})`)
      .attr('stroke-width', (d) => SEVERITY_WIDTH[d.severity] ?? 1)
      .attr('stroke-opacity', (d) => (d.severity === 'severe' ? 0.55 : 0.3))
      .attr('stroke-linecap', 'round')
      .attr('d', (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${s.x ?? 0},${s.y ?? 0}A${dr},${dr} 0 0,1 ${t.x ?? 0},${t.y ?? 0}`;
      });

    // selection glow (behind nodes)
    const glow = container
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle.glow')
      .data(nodes)
      .join('circle')
      .attr('class', 'glow')
      .attr('r', (d) => nodeRadius(d) * 1.9)
      .attr('fill', 'none')
      .attr('stroke', (d) => (d.id === selectedId ? colors.ring : 'none'))
      .attr('stroke-width', 2)
      .attr('opacity', (d) => (d.id === selectedId ? 0.35 : 0));

    const node = container
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle.node')
      .data(nodes)
      .join('circle')
      .attr('class', 'node')
      .attr('r', 0)
      .attr('fill', (d) => colors.chart[categoryIndex(d.category)] ?? '#888')
      .attr('stroke', (d) => (d.id === selectedId ? colors.ring : colors.nodeStroke))
      .attr('stroke-width', (d) => (d.id === selectedId ? 3 : 1))
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onSelect(d.id))
      .on('pointermove', (event, d) => {
        const rect = svgEl.getBoundingClientRect();
        setHovered({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          name: d.name,
          category: d.category,
          degree: d.degree,
        });
      })
      .on('pointerleave', () => setHovered(null));

    // labels with halos (paint-order stroke keeps them readable over edges)
    const label = container
      .append('g')
      .selectAll<SVGTextElement, SimNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.name)
      .attr('font-size', (d) => (d.degree >= maxDegree * 0.4 ? 11 : 8))
      .attr('fill', colors.label)
      .attr('fill-opacity', 0.9)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('paint-order', 'stroke')
      .attr('stroke', colors.card)
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.7)
      .attr('opacity', 0);

    // ENTRY BLOOM: staggered radius growth + label fade (Bostock pattern)
    node
      .transition()
      .duration(500)
      .delay((_d, i) => Math.min(i * 4, 1200))
      .attr('r', (d) => nodeRadius(d));
    link
      .transition()
      .duration(600)
      .delay(200)
      .attr('stroke-opacity', (d) => (d.severity === 'severe' ? 0.55 : 0.3));
    label
      .transition()
      .duration(400)
      .delay(600)
      .attr('opacity', 1);

    simulation.on('tick', () => {
      link.attr('d', (d) => {
        const s = d.source as SimNode;
        const t = d.target as SimNode;
        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${s.x ?? 0},${s.y ?? 0}A${dr},${dr} 0 0,1 ${t.x ?? 0},${t.y ?? 0}`;
      });
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      glow.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => (d.y ?? 0) - 10);
    });

    // hover focus: dim non-neighbors (instant neighborhood reading)
    const highlight = (id: string | null) => {
      if (!id) {
        node.attr('opacity', 1);
        glow.attr('opacity', (d) => (d.id === selectedId ? 0.35 : 0));
        link.attr('stroke-opacity', (d) => (d.severity === 'severe' ? 0.55 : 0.3));
        label.attr('opacity', 1);
        return;
      }
      const neighborIds = new Set<string>([id]);
      for (const l of links) {
        const s = String(l.source);
        const t = String(l.target);
        if (s === id) neighborIds.add(t);
        if (t === id) neighborIds.add(s);
      }
      node.attr('opacity', (d) => (neighborIds.has(d.id) ? 1 : 0.12));
      link.attr('stroke-opacity', (l) =>
        String(l.source) === id || String(l.target) === id ? 0.8 : 0.04,
      );
      label.attr('opacity', (d) => (neighborIds.has(d.id) ? 1 : 0.05));
    };

    node.on('pointerenter', (_e, d) => highlight(d.id));
    node.on('pointerleave', () => highlight(null));

    // severity filter (from the Filters panel) dims non-matching edges
    if (severityFilter) {
      link.attr('stroke-opacity', (d) =>
        d.severity === severityFilter ? 0.7 : 0.03,
      );
    }

    return () => {
      simulation.stop();
      zoomRef.current = null;
    };
  }, [data, selectedId, onSelect, size, colors, severityFilter]);

  const zoomBy = (factor: number) => {
    const svgEl = svgRef.current;
    if (!svgEl || !zoomRef.current) return;
    d3.select(svgEl)
      .transition()
      .duration(200)
      .call(zoomRef.current.scaleBy as never, factor);
  };

  const fitView = () => {
    const svgEl = svgRef.current;
    if (!svgEl || !zoomRef.current) return;
    d3.select(svgEl)
      .transition()
      .duration(200)
      .call(zoomRef.current.transform as never, d3.zoomIdentity);
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <svg ref={svgRef} className="block h-full w-full" />

      {/* legend — now interactive severity filter */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5 rounded-lg border bg-card/80 px-3 py-2 text-xs backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 rounded bg-destructive" /> severe
          interaction
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 rounded bg-muted-foreground/60" />{' '}
          moderate
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block h-0.5 w-6 rounded bg-border" /> mild · node
          size = degree
        </span>
      </div>

      {focused && (
        <div className="absolute bottom-3 left-3">
          <Badge variant="secondary" className="bg-primary/15 text-primary">
            focused: {focused} · direct neighbors only
          </Badge>
        </div>
      )}

      {/* stats strip */}
      <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-mono text-[10px]">
          {data.stats.drugs.toLocaleString()} drugs ·{' '}
          {data.stats.interactions.toLocaleString()} interactions
        </Badge>
      </div>

      {/* zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <Button size="icon-sm" variant="outline" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
          <Plus />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
          <Minus />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Fit view" onClick={fitView}>
          <Maximize2 />
        </Button>
      </div>

      {/* hover tooltip */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: hovered.x + 12, top: hovered.y - 12 }}
        >
          <p className="font-medium text-popover-foreground">{hovered.name}</p>
          <p className="text-muted-foreground">
            {hovered.degree} interactions · {hovered.category.replace('activity:', '')}
          </p>
        </div>
      )}
    </div>
  );
}
