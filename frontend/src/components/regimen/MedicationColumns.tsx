import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { ArrowDownWideNarrow, Globe, Plus, Search, X } from 'lucide-react';

import { resolveDrug } from '@/api/client';
import type { DrugSummary, ResolveMatch } from '@/api/types';
import { SeverityChip } from '@/components/SeverityChip';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  SEVERITY_RANK,
  aliasIds,
  asSeverity,
  familyOf,
  worse,
  type Severity,
} from '@/lib/domain';
import { pickedIds, useExplorer, type NeighborMap } from '@/state/explorer';

const ROW_HEIGHT = 28;

type SortMode = 'risk' | 'az' | 'degree';
const SORT_LABEL: Record<SortMode, string> = {
  risk: 'Risk first',
  az: 'A–Z',
  degree: 'Most connected',
};

interface Risk {
  worst: Severity;
  count: number;
}

interface Row {
  drug: DrugSummary;
  /** the brand / RxNorm name that matched, when it isn't the drug name */
  via?: string;
}

/** Live RxNorm fallback only when nothing matches locally. */
const RXNAV_MIN_QUERY = 3;
const RXNAV_DEBOUNCE_MS = 350;

/** Match against the dataset name, then RxNorm aliases (brands, INN, salts). */
function matchDrug(drug: DrugSummary, q: string): Row | null {
  const name = drug.name.toLowerCase();
  if (name.includes(q)) return { drug };
  const alias = drug.aliases?.find((a) => a.toLowerCase().includes(q));
  return alias ? { drug, via: alias } : null;
}

function rowStartsWith(row: Row, q: string): boolean {
  return (row.via ?? row.drug.name).toLowerCase().startsWith(q);
}

/** Worst interaction of every drug against the other picked medications. */
function riskAgainst(
  others: readonly string[],
  neighbors: Readonly<Record<string, NeighborMap>>,
): Map<string, Risk> {
  const out = new Map<string, Risk>();
  for (const other of others) {
    const map = neighbors[other];
    if (!map) continue;
    for (const n of map.values()) {
      const prev = out.get(n.id);
      out.set(n.id, {
        worst: worse(prev?.worst ?? null, asSeverity(n.severity)),
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  return out;
}

/**
 * Cascading medication lists (Miller-column pattern): each floating column
 * holds one medication of the regimen; every list is annotated with the
 * worst interaction against the OTHER picked medications, so scanning a
 * column is a live "what if I add this?" check. Older columns collapse to
 * slim vertical tabs so the whole path stays on screen.
 */
export function MedicationColumns() {
  const slots = useExplorer((s) => s.slots);
  const active = useExplorer((s) => s.active);
  const addSlot = useExplorer((s) => s.addSlot);
  const canAdd = slots[slots.length - 1]?.drug !== null;

  return (
    <div className="pointer-events-none absolute top-3 bottom-14 left-3 z-10 flex gap-2">
      {slots.map((slot, i) =>
        i === active || i >= slots.length - 2 ? (
          <MedColumn key={slot.key} index={i} />
        ) : (
          <CollapsedColumn key={slot.key} index={i} />
        ),
      )}
      {canAdd && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => addSlot()}
              aria-label="Add another medication"
              className="pointer-events-auto flex w-10 flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-3 text-muted-foreground shadow-sm backdrop-blur-md transition-colors hover:border-primary/60 hover:bg-card/80 hover:text-foreground"
            >
              <Plus className="size-4" />
              <span className="text-[11px] tracking-wide [writing-mode:vertical-rl]">
                Add medication
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add the next medication (Shift-click a node)</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function CollapsedColumn({ index }: { index: number }) {
  const drugId = useExplorer((s) => s.slots[index]?.drug ?? null);
  const name = useExplorer((s) => (drugId ? s.byId.get(drugId)?.name : null));
  const setActive = useExplorer((s) => s.setActive);
  return (
    <button
      type="button"
      onClick={() => setActive(index)}
      aria-label={`Medication ${index + 1}: ${name ?? 'empty'} — expand`}
      className="pointer-events-auto flex w-10 flex-col items-center gap-2 rounded-xl border bg-card/80 py-2.5 shadow-md backdrop-blur-md transition-colors hover:bg-card"
    >
      <span className="flex size-5 items-center justify-center rounded-md bg-muted font-mono text-[10px]">
        {index + 1}
      </span>
      <span className="truncate text-xs font-medium [writing-mode:vertical-rl]">
        {name ?? 'empty'}
      </span>
    </button>
  );
}

function MedColumn({ index }: { index: number }) {
  const drugs = useExplorer((s) => s.drugs);
  const slots = useExplorer((s) => s.slots);
  const isActive = useExplorer((s) => s.active === index);
  const neighbors = useExplorer((s) => s.neighbors);
  const { pick, removeSlot, setActive, setHover } = useExplorer.getState();

  const picked = slots[index]?.drug ?? null;
  const others = useMemo(
    () => pickedIds(slots.filter((_, i) => i !== index)),
    [slots, index],
  );
  const [query, setQuery] = useState('');
  const [sortChoice, setSortChoice] = useState<SortMode | null>(null);
  const sort: SortMode = sortChoice ?? (others.length > 0 ? 'risk' : 'az');
  const [cursor, setCursor] = useState(-1);

  const risk = useMemo(() => riskAgainst(others, neighbors), [others, neighbors]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const builtin = aliasIds(q);
    let list: Row[] = q
      ? drugs.flatMap((d) => {
          const hit = matchDrug(d, q);
          return hit ? [hit] : builtin.has(d.id) ? [{ drug: d, via: q }] : [];
        })
      : drugs.map((drug) => ({ drug }));
    const byName = (a: Row, b: Row) => a.drug.name.localeCompare(b.drug.name);
    if (sort === 'degree') list.sort((a, b) => b.drug.degree - a.drug.degree || byName(a, b));
    else if (sort === 'risk')
      list.sort((a, b) => {
        const ra = risk.get(a.drug.id);
        const rb = risk.get(b.drug.id);
        const sa = ra ? SEVERITY_RANK[ra.worst] + 1 : 0;
        const sb = rb ? SEVERITY_RANK[rb.worst] + 1 : 0;
        return sb - sa || (rb?.count ?? 0) - (ra?.count ?? 0) || byName(a, b);
      });
    else list.sort(byName);
    if (q) {
      // prefix matches first (direct name before alias), keeping the sort order
      const rank = (r: Row) => (rowStartsWith(r, q) ? (r.via ? 1 : 0) : 2);
      list = [0, 1, 2].flatMap((k) => list.filter((r) => rank(r) === k));
    }
    return list.filter((r) => !others.includes(r.drug.id));
  }, [drugs, query, sort, risk, others]);

  // hybrid search: nothing local → ask RxNorm (debounced, abortable)
  const [suggestions, setSuggestions] = useState<ResolveMatch[]>([]);
  const [rxStatus, setRxStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const trimmed = query.trim();
  const needsLive = rows.length === 0 && trimmed.length >= RXNAV_MIN_QUERY;
  useEffect(() => {
    if (!needsLive) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      resolveDrug(trimmed, controller.signal)
        .then((body) => {
          setSuggestions(body.matches.filter((m) => !others.includes(m.id)));
          setRxStatus('done');
        })
        .catch(() => {
          if (!controller.signal.aborted) setRxStatus('done');
        });
    }, RXNAV_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [needsLive, trimmed, others]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // graph hover → reveal the row in the active column (only when the
  // hover came from the graph, so list scrolling never fights the pointer)
  useEffect(() => {
    if (!isActive) return;
    return useExplorer.subscribe((s, prev) => {
      if (s.hover === prev.hover || s.hoverSource !== 'graph' || !s.hover) return;
      const idx = rows.findIndex((r) => r.drug.id === s.hover);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
    });
  }, [isActive, rows, virtualizer]);

  const interacting = others.length ? rows.filter((r) => risk.has(r.drug.id)).length : 0;
  const pickedDrug = picked ? drugs.find((d) => d.id === picked) : undefined;
  const pickedRisk = picked ? risk.get(picked) : undefined;

  const moveCursor = (next: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setCursor(clamped);
    const row = rows[clamped];
    if (row) {
      setHover(row.drug.id, 'list');
      virtualizer.scrollToIndex(clamped, { align: 'auto' });
    }
  };

  return (
    <section
      aria-label={`Medication ${index + 1}`}
      onPointerDown={() => !isActive && setActive(index)}
      className={cn(
        'pointer-events-auto flex w-64 flex-col overflow-hidden rounded-xl border bg-card/85 shadow-lg backdrop-blur-md transition-shadow',
        isActive ? 'ring-1 ring-primary/70' : 'opacity-95',
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2.5">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px]',
            isActive ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-xs font-semibold', !pickedDrug && 'text-muted-foreground')}>
            {pickedDrug?.name ?? (index === 0 ? 'Choose a medication' : 'Choose the next medication')}
          </p>
          {pickedDrug && (
            <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ background: FAMILY_COLOR[familyOf(pickedDrug.category)] }}
              />
              {FAMILY_LABEL[familyOf(pickedDrug.category)]} · {pickedDrug.degree} interactions
            </p>
          )}
        </div>
        {pickedRisk && <SeverityChip severity={pickedRisk.worst} compact />}
        {(slots.length > 1 || picked) && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Remove medication ${index + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              removeSlot(index);
            }}
          >
            <X />
          </Button>
        )}
      </header>

      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            data-col-search={index}
            autoFocus={isActive && !picked && index > 0}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(-1);
              setSuggestions([]);
              setRxStatus(e.target.value.trim().length >= RXNAV_MIN_QUERY ? 'loading' : 'idle');
            }}
            onFocus={() => setActive(index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveCursor(cursor + 1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveCursor(cursor - 1);
              } else if (e.key === 'Enter') {
                const row = rows[Math.max(cursor, 0)];
                if (row) pick(index, row.drug.id);
                else if (suggestions[0]) pick(index, suggestions[0].id);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                if (query) setQuery('');
                else e.currentTarget.blur();
                setHover(null, 'list');
              }
            }}
            placeholder={`Search ${drugs.length.toLocaleString()} drugs`}
            aria-label={`Search medications for column ${index + 1}`}
            className="h-7 w-full rounded-md border bg-background/60 pr-7 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          {isActive && !query && (
            <Kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">/</Kbd>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Sort: ${SORT_LABEL[sort]}`}
              onClick={() => {
                const order: SortMode[] = others.length ? ['risk', 'az', 'degree'] : ['az', 'degree'];
                setSortChoice(order[(order.indexOf(sort) + 1) % order.length]);
              }}
            >
              <ArrowDownWideNarrow />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sort: {SORT_LABEL[sort]} (click to change)</TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={scrollRef}
        role="listbox"
        aria-label={`Drugs for medication ${index + 1}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onPointerLeave={() => {
          const s = useExplorer.getState();
          if (s.hoverSource === 'list') s.setHover(null, 'list');
        }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const { drug, via } = rows[item.index];
            return (
              <DrugRow
                key={drug.id}
                drug={drug}
                via={via}
                top={item.start}
                risk={risk.get(drug.id)}
                showRisk={others.length > 0}
                picked={drug.id === picked}
                cursor={item.index === cursor}
                onPick={() => pick(index, drug.id)}
              />
            );
          })}
        </div>
        {rows.length === 0 && (
          <div className="px-3 py-4 text-xs">
            {needsLive && rxStatus !== 'done' && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Globe className="size-3.5 animate-pulse" /> Checking RxNorm for “{trimmed}”…
              </p>
            )}
            {needsLive && rxStatus === 'done' && suggestions.length > 0 && (
              <>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                  <Globe className="size-3" /> Did you mean (RxNorm)
                </p>
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(index, m.id)}
                    onPointerEnter={() => setHover(m.id, 'list')}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted/70"
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground">via {m.via}</span>
                  </button>
                ))}
              </>
            )}
            {(!needsLive || (rxStatus === 'done' && suggestions.length === 0)) && (
              <p className="py-2 text-center text-muted-foreground">
                No drug matches “{query}” in this dataset or RxNorm.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-2.5 text-[10px] text-muted-foreground">
        <span>{rows.length.toLocaleString()} drugs</span>
        {others.length > 0 && (
          <span>
            <span className="text-foreground">{interacting.toLocaleString()}</span> interact with
            regimen
          </span>
        )}
      </footer>
    </section>
  );
}

const DrugRow = memo(function DrugRow({
  drug,
  via,
  top,
  risk,
  showRisk,
  picked,
  cursor,
  onPick,
}: {
  drug: DrugSummary;
  via?: string;
  top: number;
  risk: Risk | undefined;
  showRisk: boolean;
  picked: boolean;
  cursor: boolean;
  onPick: () => void;
}) {
  const hovered = useExplorer((s) => s.hover === drug.id);
  const family = familyOf(drug.category);
  return (
    <div
      role="option"
      aria-selected={picked}
      onClick={onPick}
      onPointerEnter={() => useExplorer.getState().setHover(drug.id, 'list')}
      className={cn(
        'absolute inset-x-0 flex cursor-pointer items-center gap-2 border-l-2 border-transparent px-2.5 text-xs select-none',
        (hovered || cursor) && 'bg-muted/70',
        picked && 'border-primary bg-primary/15 font-medium',
        hovered && !picked && 'border-muted-foreground/50',
      )}
      style={{ top, height: ROW_HEIGHT }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[family] }} />
      <span className="min-w-0 flex-1 truncate">
        {drug.name}
        {via && <span className="ml-1.5 text-[10px] text-muted-foreground">via {via}</span>}
      </span>
      {showRisk && risk ? (
        <span className="flex items-center gap-1">
          {risk.count > 1 && <span className="font-mono text-[10px] text-muted-foreground">×{risk.count}</span>}
          <SeverityChip severity={risk.worst} compact />
        </span>
      ) : showRisk ? (
        <span className="size-1.5 rounded-full bg-border" title="No interaction with the regimen in this dataset" />
      ) : (
        <span className="font-mono text-[10px] text-muted-foreground">{drug.degree}</span>
      )}
    </div>
  );
});

