import { useMemo, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Eraser,
  Filter,
  Grid3x3,
  Keyboard,
  Link2,
  List,
  Maximize2,
  Network,
  Palette,
  Pill,
  Printer,
  Trash2,
  Waypoints,
} from 'lucide-react';

import type { GraphHandle } from '@/components/graph/DrugGraph';
import { SeverityChip } from '@/components/SeverityChip';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  FAMILIES,
  FAMILY_COLOR,
  FAMILY_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  aliasIds,
  asSeverity,
  familyOf,
  worse,
  type Severity,
} from '@/lib/domain';
import { copyRegimenLink, exportRegimenCsv } from '@/lib/regimen';
import { MOD } from '@/lib/shortcuts';
import { pickedIds, useExplorer } from '@/state/explorer';
import { useHistoryNav } from '@/state/history';

const MAX_DRUGS = 30;

interface Action {
  id: string;
  group: 'Regimen' | 'View' | 'Navigate' | 'Help';
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

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
  const slots = useExplorer((s) => s.slots);
  const neighbors = useExplorer((s) => s.neighbors);
  const byId = useExplorer((s) => s.byId);
  const edgeMode = useExplorer((s) => s.edgeMode);
  const regimenView = useExplorer((s) => s.regimenView);
  const familyFocus = useExplorer((s) => s.familyFocus);
  const severityFilter = useExplorer((s) => s.severityFilter);
  const canBack = useHistoryNav((s) => s.canBack);
  const canForward = useHistoryNav((s) => s.canForward);
  const [query, setQuery] = useState('');
  // controlled highlight: with our own filtering cmdk would keep a stale,
  // filtered-out item highlighted and Enter would do nothing
  const [highlighted, setHighlighted] = useState('');

  const picks = useMemo(() => [...new Set(pickedIds(slots))], [slots]);

  // worst interaction of every drug with the current regimen
  const risk = useMemo(() => {
    const out = new Map<string, Severity>();
    for (const p of picks)
      for (const n of neighbors[p]?.values() ?? []) out.set(n.id, worse(out.get(n.id) ?? null, asSeverity(n.severity)));
    return out;
  }, [picks, neighbors]);

  const q = query.trim().toLowerCase();
  const drugHits = useMemo(() => {
    if (!q) return [];
    const builtin = aliasIds(q);
    const hits: { id: string; name: string; via?: string; rank: number }[] = [];
    for (const d of drugs) {
      if (picks.includes(d.id)) continue;
      const name = d.name.toLowerCase();
      const alias = d.aliases?.find((a) => a.toLowerCase().includes(q));
      if (name.includes(q)) hits.push({ id: d.id, name: d.name, rank: name.startsWith(q) ? 0 : 2 });
      else if (alias) hits.push({ id: d.id, name: d.name, via: alias, rank: alias.toLowerCase().startsWith(q) ? 1 : 3 });
      else if (builtin.has(d.id)) hits.push({ id: d.id, name: d.name, via: q, rank: 1 });
    }
    return hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).slice(0, MAX_DRUGS);
  }, [q, drugs, picks]);

  const state = useExplorer.getState;
  const actions: Action[] = [
    ...picks.map((id) => ({
      id: `remove-${id}`,
      group: 'Regimen' as const,
      label: `Remove ${byId.get(id)?.name ?? id}`,
      icon: Trash2,
      keywords: 'delete drop medication',
      run: () => state().removeDrug(id),
    })),
    ...(picks.length
      ? [
          { id: 'clear', group: 'Regimen' as const, label: 'Clear regimen', icon: Eraser, keywords: 'reset new', run: () => state().setRegimen([]) },
          { id: 'link', group: 'Regimen' as const, label: 'Copy shareable link', icon: Link2, keywords: 'url share', run: copyRegimenLink },
          { id: 'csv', group: 'Regimen' as const, label: 'Download CSV', icon: Download, keywords: 'export spreadsheet', run: exportRegimenCsv },
          { id: 'print', group: 'Regimen' as const, label: 'Print report', icon: Printer, keywords: 'pdf paper', run: () => setTimeout(() => window.print(), 150) },
          {
            id: 'view',
            group: 'Regimen' as const,
            label: regimenView === 'list' ? 'Show pair matrix' : 'Show pair list',
            icon: regimenView === 'list' ? Grid3x3 : List,
            shortcut: 'M',
            keywords: 'heatmap table',
            run: () => state().setRegimenView(regimenView === 'list' ? 'matrix' : 'list'),
          },
        ]
      : []),
    {
      id: 'edges',
      group: 'View',
      label: edgeMode === 'summary' ? 'Show all edges' : 'Show summary edges',
      icon: edgeMode === 'summary' ? Network : Waypoints,
      shortcut: 'E',
      keywords: 'bundle fan lines',
      run: () => state().setEdgeMode(edgeMode === 'summary' ? 'all' : 'summary'),
    },
    { id: 'fit', group: 'View', label: 'Fit graph', icon: Maximize2, shortcut: 'F', keywords: 'zoom reset camera', run: () => graph?.reset() },
    ...FAMILIES.map((f) => ({
      id: `family-${f}`,
      group: 'View' as const,
      label: familyFocus === f ? `Stop focusing ${FAMILY_LABEL[f]}` : `Focus family: ${FAMILY_LABEL[f]}`,
      icon: Palette,
      keywords: 'family colour highlight',
      run: () => state().toggleFamily(f),
    })),
    ...SEVERITIES.map((sev) => ({
      id: `sev-${sev}`,
      group: 'View' as const,
      label: severityFilter === sev ? `Clear severity filter` : `Only ${SEVERITY_LABEL[sev].toLowerCase()} interactions`,
      icon: Filter,
      keywords: 'severity filter',
      run: () => state().setSeverityFilter(severityFilter === sev ? null : sev),
    })),
    ...(canBack ? [{ id: 'back', group: 'Navigate' as const, label: 'Previous regimen', icon: ArrowLeft, shortcut: 'Alt ←', run: () => window.history.back() }] : []),
    ...(canForward ? [{ id: 'fwd', group: 'Navigate' as const, label: 'Next regimen', icon: ArrowRight, shortcut: 'Alt →', run: () => window.history.forward() }] : []),
    { id: 'help', group: 'Help', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: '?', keywords: 'keys help', run: () => state().setHelpOpen(true) },
  ];
  const visible = q
    ? actions.filter((a) => `${a.label} ${a.keywords ?? ''}`.toLowerCase().includes(q))
    : actions;
  const groups = (['Regimen', 'View', 'Navigate', 'Help'] as const)
    .map((g) => ({ g, items: visible.filter((a) => a.group === g) }))
    .filter((x) => x.items.length > 0);

  const firstValue = drugHits[0] ? `drug-${drugHits[0].id}` : (groups[0]?.items[0]?.id ?? '');
  const visibleValues = new Set([...drugHits.map((d) => `drug-${d.id}`), ...visible.map((a) => a.id)]);
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
              {drugHits.map((d) => {
                const family = familyOf(byId.get(d.id)?.category ?? '');
                const r = risk.get(d.id);
                return (
                  <CommandItem
                    key={d.id}
                    value={`drug-${d.id}`}
                    onSelect={() => {
                      state().addToRegimen(d.id);
                      close();
                    }}
                  >
                    <Pill className="text-muted-foreground" />
                    <span className="size-2 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[family] }} />
                    <span className="truncate">{d.name}</span>
                    {d.via && <span className="truncate text-xs text-muted-foreground">via {d.via}</span>}
                    <span className="ml-auto flex items-center">
                      {r ? <SeverityChip severity={r} compact /> : picks.length > 0 && <span className="text-[10px] text-muted-foreground">none in dataset</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {groups.map(({ g, items }, i) => (
            <div key={g}>
              {(i > 0 || drugHits.length > 0) && <CommandSeparator />}
              <CommandGroup heading={g}>
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
            </div>
          ))}
        </CommandList>
    </Command>
  );
}
