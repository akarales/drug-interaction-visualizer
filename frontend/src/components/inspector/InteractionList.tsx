import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { Search } from 'lucide-react';

import type { NeighborInfo } from '@/api/types';
import { SeverityBar } from '@/components/inspector/SeverityBar';
import { FAMILY_COLOR, SEVERITIES, SEVERITY_LABEL, asSeverity, familyOf, kindLabel, type Severity } from '@/lib/domain';
import { pairKey, useExplorer, type NeighborMap } from '@/state/explorer';

const ROW = 26;

type Item =
  | { kind: 'header'; severity: Severity; count: number }
  | { kind: 'row'; n: NeighborInfo; severity: Severity };

/**
 * Every interaction of the focused drug, grouped worst-first. Hover links
 * to the graph; click pins the pair in the pair card. The severity legend
 * doubles as the graph filter (hides non-matching drugs).
 */
export function InteractionList({ focus, map }: { focus: string; map: NeighborMap }) {
  const severityFilter = useExplorer((s) => s.severityFilter);
  const setSeverityFilter = useExplorer((s) => s.setSeverityFilter);
  const inspectPair = useExplorer((s) => s.inspectPair);
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Partial<Record<Severity, number>> = {};
    for (const n of map.values()) {
      const s = asSeverity(n.severity);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [map]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Item[] = [];
    for (const severity of SEVERITIES) {
      if (severityFilter && severity !== severityFilter) continue;
      const rows = [...map.values()]
        .filter((n) => asSeverity(n.severity) === severity)
        .filter((n) => !q || n.name.toLowerCase().includes(q) || kindLabel(n.kind).includes(q))
        .sort((x, y) => x.name.localeCompare(y.name));
      if (rows.length === 0) continue;
      out.push({ kind: 'header', severity, count: rows.length });
      for (const n of rows) out.push({ kind: 'row', n, severity });
    }
    return out;
  }, [map, query, severityFilter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 10,
  });
  const pinnedKey = inspectPair ? pairKey(inspectPair[0], inspectPair[1]) : null;

  return (
    <div className="flex flex-col gap-2">
      <SeverityBar
        counts={counts}
        active={severityFilter}
        onPick={(s) => setSeverityFilter(severityFilter === s ? null : s)}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by drug or effect…"
          aria-label="Filter interactions"
          className="h-7 w-full rounded-md border bg-background/60 pr-2 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        />
      </div>
      <div
        ref={scrollRef}
        className="max-h-[42vh] overflow-y-auto overscroll-contain rounded-md border"
        onPointerLeave={() => {
          const s = useExplorer.getState();
          if (s.hoverSource === 'list') s.setHover(null, 'list');
        }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            const style = { top: v.start, height: ROW };
            if (item.kind === 'header')
              return (
                <div
                  key={`h-${item.severity}`}
                  style={style}
                  className="absolute inset-x-0 flex items-center gap-2 border-b bg-muted/60 px-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >
                  {SEVERITY_LABEL[item.severity]}
                  <span className="font-mono font-normal">{item.count}</span>
                </div>
              );
            const { n } = item;
            const pinned = pinnedKey === pairKey(focus, n.id);
            return (
              <button
                key={n.id}
                type="button"
                style={style}
                onClick={() => useExplorer.getState().setInspectPair([focus, n.id])}
                onPointerEnter={() => useExplorer.getState().setHover(n.id, 'list')}
                className={cn(
                  'absolute inset-x-0 flex items-center gap-2 border-l-2 border-transparent px-2 text-left text-xs hover:bg-muted/70',
                  pinned && 'border-primary bg-primary/15',
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[familyOf(n.category)] }} />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                <span className="max-w-[45%] shrink-0 truncate text-[10px] text-muted-foreground">
                  {kindLabel(n.kind)}
                </span>
              </button>
            );
          })}
        </div>
        {items.length === 0 && (
          <p className="p-3 text-center text-xs text-muted-foreground">No interactions match.</p>
        )}
      </div>
    </div>
  );
}
