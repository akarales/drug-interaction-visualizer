import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from 'cn';
import { GripVertical, PanelLeftClose } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { announce } from '@/shared/announce';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

import { MedicationCard } from './MedicationCard';

/** A rail entry: the card (reorderable by its grip), or a stub while it floats. */
export function RailItem({
  slotKey,
  index,
  dragging,
  onGripDown,
}: {
  slotKey: number;
  index: number;
  dragging: boolean;
  onGripDown: (index: number, e: PointerEvent<HTMLElement>) => void;
}) {
  const floating = useExplorer((s) => s.floatingSlot === slotKey);
  const drug = useExplorer((s) => s.slots[index]?.drug ?? null);
  const count = useExplorer((s) => s.slots.length);
  const name = useDrugName();
  const label = drug ? name(drug) : 'empty card';

  // focused grip: plain ↑/↓ also reorders (the card itself uses Alt+↑/↓)
  const onGripKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    e.stopPropagation();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= count) return;
    useExplorer.getState().moveSlot(index, to);
    announce(`${label} moved to position ${to + 1} of ${count}`);
    // keep focus on the moved card's grip
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${slotKey}"]`)?.focus());
  };

  return (
    <li data-reorder-item className={cn('list-none transition-opacity motion-reduce:transition-none', dragging && 'opacity-50')}>
      {floating ? (
        <div className="flex h-9 items-center gap-2 rounded-xl border border-dashed px-2.5 text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{label} — floating</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => useExplorer.getState().setFloatingSlot(null)}
            aria-label={`Dock medication ${index + 1} back into the list`}
          >
            <PanelLeftClose /> Dock
          </Button>
        </div>
      ) : (
        <MedicationCard
          index={index}
          grip={
            <button
              type="button"
              data-grip={slotKey}
              aria-label={`Reorder medication ${index + 1} (drag, or arrow keys)`}
              title="Drag to reorder (or ↑/↓ while focused)"
              onPointerDown={(e) => {
                e.stopPropagation();
                onGripDown(index, e);
              }}
              onKeyDown={onGripKey}
              className="-ml-0.5 flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          }
        />
      )}
    </li>
  );
}
