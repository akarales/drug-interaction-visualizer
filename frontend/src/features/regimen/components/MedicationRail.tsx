import { useRef, type ReactNode } from 'react';
import { FolderOpen, Pill, Plus, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { announce } from '@/shared/announce';
import { usePicks, useExplorer } from '@/state';

import { useReorder } from '../hooks/useReorder';
import { RailItem } from './RailItem';

/**
 * The regimen as a vertical stack of content-height cards. Any number can
 * be open at once; the rail scrolls. Order = regimen order (and URL order):
 * drag a card by its grip, or use the keyboard (↑/↓ on the grip, Alt+↑/↓
 * anywhere in the card).
 */
export function MedicationRail({ headerAction }: { headerAction?: ReactNode }) {
  const slots = useExplorer((s) => s.slots);
  const picks = usePicks();
  const addSlot = useExplorer((s) => s.addSlot);
  const canAdd = slots[slots.length - 1]?.drug !== null;
  const saved = useExplorer((s) => s.savedRegimen);
  const setDialog = useExplorer((s) => s.setRegimenDialog);
  const listRef = useRef<HTMLOListElement>(null);
  const { state: drag, start } = useReorder(listRef, (from, to) => {
    useExplorer.getState().moveSlot(from, to);
    announce(`Moved to position ${to + 1} of ${slots.length}`);
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <Pill className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-xs font-semibold">Medications</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{picks.length}</span>
        <div className="ml-auto flex items-center">
          {[
            { label: saved ? 'Save changes to this regimen' : 'Save regimen', icon: Save, dialog: 'save' as const, disabled: picks.length === 0 },
            { label: 'Open a saved regimen', icon: FolderOpen, dialog: 'open' as const, disabled: false },
          ].map(({ label, icon: Icon, dialog, disabled }) => (
            <Tooltip key={dialog}>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label={label} disabled={disabled} onClick={() => setDialog(dialog)}>
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
          {headerAction}
        </div>
      </header>
      {saved && (
        <p className="flex shrink-0 items-center gap-1.5 truncate border-b px-3 py-1 text-[11px] text-muted-foreground">
          Saved as <span className="truncate font-medium text-foreground">{saved.label}</span>
          {!saved.currentDataset && <span className="text-(--sev-severe-text)">· older dataset build</span>}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
        <ol ref={listRef} className="relative flex flex-col gap-2" aria-label="Regimen order">
          {slots.map((slot, i) => (
            <RailItem key={slot.key} slotKey={slot.key} index={i} dragging={drag?.from === i} onGripDown={start} />
          ))}
          {drag && (
            <li
              aria-hidden
              className="pointer-events-none absolute inset-x-1 h-0.5 list-none rounded-full bg-primary"
              style={{ top: drag.lineY + 3 }}
            />
          )}
        </ol>
        {canAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => addSlot()}
                aria-label="Add another medication"
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-card/60 hover:text-foreground"
              >
                <Plus className="size-4" /> Add medication
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add the next medication (or Shift-click a node)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
