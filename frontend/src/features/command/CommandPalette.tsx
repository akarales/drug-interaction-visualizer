import { useMemo, useState } from 'react';
import { Pill } from 'lucide-react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import type { GraphHandle } from '@/features/graph';
import { regimenRisk } from '@/features/regimen';
import { matchDrugs } from '@/features/search';
import { FamilyDot } from '@/shared/components/FamilyDot';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { familyOf } from '@/shared/domain';
import { useExplorer, usePicks } from '@/state';

import { ACTION_GROUPS, usePaletteActions } from './actions';
import { MOD } from './shortcuts';

const MAX_DRUGS = 30;

/**
 * ⌘K palette: every action is reachable from the keyboard (VS Code / Linear
 * pattern). Drug search reuses the brand/INN aliases and shows each drug's
 * worst interaction with the current regimen, so the palette doubles as a
 * quick "what if I add this?" check.
 */
export function CommandPalette({ graph }: { graph: GraphHandle | null }) {
  const open = useExplorer((s) => s.paletteOpen);
  const setOpen = useExplorer((s) => s.setPaletteOpen);
  const session = useExplorer((s) => s.paletteSession);
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search drugs and actions">
      {/* new session key on every open → fresh, empty query */}
      <PaletteBody key={session} graph={graph} close={() => setOpen(false)} />
    </CommandDialog>
  );
}

function PaletteBody({ graph, close }: { graph: GraphHandle | null; close: () => void }) {
  const drugs = useExplorer((s) => s.drugs);
  const neighbors = useExplorer((s) => s.neighbors);
  const picks = usePicks();
  const actions = usePaletteActions(picks, graph);
  const [query, setQuery] = useState('');
  // controlled highlight: with our own filtering cmdk would keep a stale,
  // filtered-out item highlighted and Enter would do nothing
  const [highlighted, setHighlighted] = useState('');

  // worst interaction of every drug with the current regimen
  const risk = useMemo(() => regimenRisk(picks, neighbors), [picks, neighbors]);

  const q = query.trim().toLowerCase();
  const drugHits = useMemo(
    () =>
      matchDrugs(drugs, q)
        .filter((m) => !picks.includes(m.drug.id))
        .sort((a, b) => a.rank - b.rank || a.drug.name.localeCompare(b.drug.name))
        .slice(0, MAX_DRUGS),
    [q, drugs, picks],
  );

  const visible = q ? actions.filter((a) => `${a.label} ${a.keywords ?? ''}`.toLowerCase().includes(q)) : actions;
  const groups = ACTION_GROUPS.map((g) => ({ g, items: visible.filter((a) => a.group === g) })).filter(
    (x) => x.items.length > 0,
  );

  const firstValue = drugHits[0] ? `drug-${drugHits[0].drug.id}` : (groups[0]?.items[0]?.id ?? '');
  const visibleValues = new Set([...drugHits.map((d) => `drug-${d.drug.id}`), ...visible.map((a) => a.id)]);
  const value = visibleValues.has(highlighted) ? highlighted : firstValue;

  return (
    <Command shouldFilter={false} loop value={value} onValueChange={setHighlighted}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setHighlighted('');
          }}
          placeholder={`Add a drug (name or brand) or run a command…   ${MOD}K`}
        />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>No drugs or commands match “{query}”.</CommandEmpty>
          {drugHits.length > 0 && (
            <CommandGroup heading={picks.length ? 'Add to regimen (risk vs current)' : 'Add to regimen'}>
              {drugHits.map(({ drug, via }) => {
                const r = risk.get(drug.id)?.worst;
                return (
                  <CommandItem
                    key={drug.id}
                    value={`drug-${drug.id}`}
                    onSelect={() => {
                      useExplorer.getState().addToRegimen(drug.id);
                      close();
                    }}
                  >
                    <Pill className="text-muted-foreground" />
                    <FamilyDot family={familyOf(drug.category)} className="size-2 shrink-0" />
                    <span className="truncate">{drug.name}</span>
                    {via && <span className="truncate text-xs text-muted-foreground">via {via}</span>}
                    <span className="ml-auto flex items-center">
                      {r ? <SeverityChip severity={r} compact /> : picks.length > 0 && <span className="text-[10px] text-muted-foreground">none in dataset</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {groups.map(({ g, items }, i) => (
            // a border, not <CommandSeparator>: role=separator is not allowed inside a listbox
            <CommandGroup key={g} heading={g} className={i > 0 || drugHits.length > 0 ? 'border-t' : undefined}>
                {items.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.id}
                    onSelect={() => {
                      close();
                      a.run();
                    }}
                  >
                    <a.icon className="text-muted-foreground" />
                    <span>{a.label}</span>
                    {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
    </Command>
  );
}
