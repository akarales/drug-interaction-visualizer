import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { ArrowDownWideNarrow, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RXNAV_MIN_QUERY, useRxNormFallback } from '@/features/search';
import { announce } from '@/shared/announce';
import { ActiveTrace } from '@/shared/components/ActiveTrace';
import { DESKTOP_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useExplorer } from '@/state';

import { SORT_LABEL, useColumnRows, type SortMode } from '../hooks/useColumnRows';
import { DrugRow, ROW_HEIGHT } from './DrugRow';
import { MedicationCardHeader } from './MedicationCardHeader';
import { NoMatches } from './NoMatches';

/** Expanded list height: ~10 rows, then the list scrolls. */
const LIST_MAX = 288;

/**
 * One medication of the regimen as a content-height card: header (pick,
 * worst risk vs the OTHER picks, actions), search, virtual list, footer.
 * Collapses to its header only when the user asks (remembered per drug).
 */
export function MedicationCard({ index, floating = false, grip }: { index: number; floating?: boolean; grip?: ReactNode }) {
  const slot = useExplorer((s) => s.slots[index]);
  const slotCount = useExplorer((s) => s.slots.length);
  const isActive = useExplorer((s) => s.active === index);
  const collapsedCards = useExplorer((s) => s.collapsedCards);
  const { pick, removeSlot, setActive, setHover, moveSlot, setCardCollapsed, setFloatingSlot } = useExplorer.getState();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const [query, setQuery] = useState('');
  const [sortChoice, setSortChoice] = useState<SortMode | null>(null);
  const [cursor, setCursor] = useState(-1);
  const { drugs, picked, others, sort, risk, rows } = useColumnRows(index, query, sortChoice);
  const collapsed = picked ? Boolean(collapsedCards[picked]) : false;

  const needsLive = rows.length === 0 && query.trim().length >= RXNAV_MIN_QUERY;
  const { status, suggestions } = useRxNormFallback(query, needsLive, others);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // graph hover → reveal the row in the active card (only when the hover
  // came from the graph, so list scrolling never fights the pointer)
  useEffect(() => {
    if (!isActive || collapsed) return;
    return useExplorer.subscribe((s, prev) => {
      if (s.hover === prev.hover || s.hoverSource !== 'graph' || !s.hover) return;
      const idx = rows.findIndex((r) => r.drug.id === s.hover);
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
    });
  }, [isActive, collapsed, rows, virtualizer]);

  if (!slot) return null;
  const interacting = others.length ? rows.filter((r) => risk.has(r.drug.id)).length : 0;
  const pickedDrug = picked ? drugs.find((d) => d.id === picked) : undefined;
  const name = pickedDrug?.name ?? 'empty card';

  const moveCursor = (next: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setCursor(clamped);
    const row = rows[clamped];
    if (row) {
      setHover(row.drug.id, 'list');
      virtualizer.scrollToIndex(clamped, { align: 'auto' });
    }
  };

  // after a pick, show the whole list again (annotated against the regimen)
  const choose = (id: string) => {
    pick(index, id);
    setQuery('');
    setCursor(-1);
  };

  const onCardKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey && !floating && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = index + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= slotCount) return;
      moveSlot(index, to);
      announce(`${name} moved to position ${to + 1} of ${slotCount}`);
    } else if (floating && e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) {
      setFloatingSlot(null);
      document.querySelector<HTMLElement>('[data-region="rail"]')?.focus();
    }
  };

  return (
    <section
      aria-label={`Medication ${index + 1}`}
      aria-current={isActive || undefined}
      onPointerDown={() => !isActive && setActive(index)}
      onKeyDown={onCardKey}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border transition-opacity',
        floating ? 'glass shadow-xl' : 'bg-card/70 shadow-sm',
        !isActive && 'opacity-95',
      )}
    >
      {isActive && <ActiveTrace />}
      <MedicationCardHeader
        index={index}
        drug={pickedDrug}
        worst={picked ? risk.get(picked)?.worst : undefined}
        isActive={isActive}
        collapsed={collapsed}
        onToggle={picked ? () => setCardCollapsed(picked, !collapsed) : undefined}
        grip={grip}
        floating={floating}
        onFloat={desktop && picked ? () => setFloatingSlot(floating ? null : slot.key) : undefined}
        onRemove={slotCount > 1 || picked ? () => removeSlot(index) : undefined}
      />

      {!collapsed && (
        <>
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
                }}
                onFocus={() => setActive(index)}
                onKeyDown={(e) => {
                  if (e.altKey) return; // Alt+↑/↓ reorders the card
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveCursor(cursor + 1);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveCursor(cursor - 1);
                  } else if (e.key === 'Enter') {
                    const row = rows[Math.max(cursor, 0)];
                    if (row) choose(row.drug.id);
                    else if (suggestions[0]) choose(suggestions[0].id);
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    if (query) setQuery('');
                    else e.currentTarget.blur();
                    setHover(null, 'list');
                  }
                }}
                placeholder={`Search ${drugs.length.toLocaleString()} drugs`}
                aria-label={`Search medications for card ${index + 1}`}
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
            className="overflow-y-auto overscroll-contain"
            style={{ height: rows.length ? Math.min(LIST_MAX, rows.length * ROW_HEIGHT) : undefined }}
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
                    onPick={() => choose(drug.id)}
                  />
                );
              })}
            </div>
            {rows.length === 0 && (
              <NoMatches
                query={query}
                needsLive={needsLive}
                status={status}
                suggestions={suggestions}
                onPick={choose}
              />
            )}
          </div>

          <footer className="flex h-7 shrink-0 items-center justify-between border-t px-2.5 text-[11px] text-muted-foreground">
            <span>{rows.length.toLocaleString()} drugs</span>
            {others.length > 0 && (
              <span>
                <span className="text-foreground">{interacting.toLocaleString()}</span> interact with
                regimen
              </span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
