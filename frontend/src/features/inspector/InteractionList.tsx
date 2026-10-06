import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { Search } from 'lucide-react';

import type { NeighborInfo } from '@/api/schemas';
import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityBar } from '@/shared/components/SeverityBar';
import {
  ROLE_ARROW,
  ROLE_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  asSeverity,
  familyOf,
  kindLabel,
  roleOf,
  severityCounts,
  type RoleOfFocus,
  type Severity,
} from '@/shared/domain';
import { pairKey, useExplorer, type NeighborMap } from '@/state';

import { DirectionFilter } from './DirectionFilter';

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
  const [role, setRole] = useState<RoleOfFocus | null>(null);

  const counts = useMemo(() => severityCounts(map.values()), [map]);
  const roleCounts = useMemo(() => {
    const c: Record<RoleOfFocus, number> = { acts: 0, affected: 0, both: 0 };
    for (const n of map.values()) {
      const r = roleOf(focus, n.roles);
      if (r) c[r] += 1;
    }
    return c;
  }, [map, focus]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Item[] = [];
    for (const severity of SEVERITIES) {
      if (severityFilter && severity !== severityFilter) continue;
      const rows = [...map.values()]
        .filter((n) => asSeverity(n.severity) === severity)
        .filter((n) => !role || roleOf(focus, n.roles) === role)
        .filter((n) => !q || n.name.toLowerCase().includes(q) || kindLabel(n.kind).includes(q))
        .sort((x, y) => x.name.localeCompare(y.name));
      if (rows.length === 0) continue;
      out.push({ kind: 'header', severity, count: rows.length });
      for (const n of rows) out.push({ kind: 'row', n, severity });
    }
    return out;
  }, [map, query, severityFilter, role, focus]);

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
      <DirectionFilter value={role} onChange={setRole} counts={roleCounts} total={map.size} />
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
                <FamilyDot family={familyOf(n.category)} className="size-1.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                {(() => {
                  const r = roleOf(focus, n.roles);
                  return r ? (
                    <span
                      className="shrink-0 font-mono text-[11px] text-primary"
                      title={`${ROLE_LABEL[r]} (FDA CYP/transporter table)`}
                      aria-label={`${ROLE_LABEL[r]} ${n.name}`}
                    >
                      {ROLE_ARROW[r]}
                    </span>
                  ) : null;
                })()}
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
