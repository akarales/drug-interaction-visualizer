import { toast } from 'sonner';
import { create } from 'zustand';

import { fetchNeighbors, type ModelChoice } from '@/api/client';
import type { DatasetStats, DrugSummary, ExplanationPayload, NeighborInfo } from '@/api/types';
import { asSeverity, type Family, type Severity } from '@/lib/domain';
import { readJson, writeJson } from '@/lib/storage';

/** summary = severe edges individually + other edges bundled per family */
export type EdgeMode = 'summary' | 'all';
const EDGE_MODE_KEY = 'ddi.edge-mode';
export type RegimenView = 'list' | 'matrix';
const REGIMEN_VIEW_KEY = 'ddi.regimen-view';

/** What window.print() renders: the regimen report, or a patient handout. */
export type PrintJob = {
  kind: 'handout';
  a: string;
  b: string;
  severity: Severity | null;
  section: ExplanationPayload;
  model: string;
};

export type NeighborMap = ReadonlyMap<string, NeighborInfo>;
export type HoverSource = 'graph' | 'list';
/** One medication column; `key` is stable across removals. */
export interface Slot {
  key: number;
  drug: string | null;
}

/**
 * Interaction state for the whole app. The graph renderer subscribes to
 * this store OUTSIDE React (hover never re-renders the graph component);
 * list rows subscribe with narrow selectors so only affected rows render.
 *
 * Neighbour lists are cached by drug id and never overwritten, so a panel
 * can never show one drug's interactions under another drug's name.
 */
interface Explorer {
  drugs: DrugSummary[];
  byId: ReadonlyMap<string, DrugSummary>;
  stats: DatasetStats | null;

  /** Medication columns, left to right. */
  slots: Slot[];
  /** Index of the column that receives graph clicks / keyboard. */
  active: number;
  hover: string | null;
  hoverSource: HoverSource | null;
  familyFocus: Family | null;
  severityFilter: Severity | null;
  neighbors: Readonly<Record<string, NeighborMap>>;
  /** LLM provider + model for explanations; null = server default. */
  modelChoice: ModelChoice | null;
  /** Contraindicated pairs the user chose to keep, with the reason. */
  overrides: Readonly<Record<string, Override>>;
  /** Pair pinned in the inspector's pair card; null = worst regimen pair. */
  inspectPair: readonly [string, string] | null;
  edgeMode: EdgeMode;
  regimenView: RegimenView;
  /** null = the regimen report */
  printJob: PrintJob | null;
  /** ⌘K command palette / `?` shortcut overlay */
  paletteOpen: boolean;
  /** increments on every open so the palette body remounts with an empty query */
  paletteSession: number;
  helpOpen: boolean;

  setEdgeMode(mode: EdgeMode): void;
  setRegimenView(view: RegimenView): void;
  /** Render a print job and open the browser print dialog. */
  print(job: PrintJob | null): void;
  setPaletteOpen(open: boolean): void;
  setHelpOpen(open: boolean): void;
  /** Add a drug the way the palette does: fill the active empty column, else a new one. */
  addToRegimen(id: string): void;

  setInspectPair(pair: readonly [string, string] | null): void;

  setModelChoice(choice: ModelChoice | null): void;
  overridePair(a: string, b: string, reason: string): void;
  /** Remove the column holding `drug` (used by "remove" in the alert). */
  removeDrug(drug: string): void;
  setDataset(drugs: DrugSummary[], stats: DatasetStats): void;
  pick(slot: number, id: string): void;
  /** Replace the whole regimen (URL restore / history navigation). */
  setRegimen(ids: readonly string[]): void;
  addSlot(id?: string): void;
  removeSlot(slot: number): void;
  setActive(slot: number): void;
  setHover(id: string | null, source: HoverSource): void;
  toggleFamily(family: Family): void;
  setSeverityFilter(severity: Severity | null): void;
  ensureNeighbors(id: string): void;
  /** One level per press: hover → family focus → active pick. */
  escape(): void;
}

/** Recorded decision to keep a contraindicated pair (CPOE-style override). */
export interface Override {
  reason: string;
  at: string;
}

const MODEL_KEY = 'ddi.model-choice';

function loadModelChoice(): ModelChoice | null {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return raw ? (JSON.parse(raw) as ModelChoice) : null;
  } catch {
    return null;
  }
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const inflight = new Set<string>();
let nextKey = 1;
const slot = (drug: string | null): Slot => ({ key: nextKey++, drug });

export const useExplorer = create<Explorer>()((set, get) => ({
  drugs: [],
  byId: new Map(),
  stats: null,
  slots: [slot(null)],
  active: 0,
  hover: null,
  hoverSource: null,
  familyFocus: null,
  severityFilter: null,
  neighbors: {},
  modelChoice: loadModelChoice(),
  overrides: {},
  inspectPair: null,
  edgeMode: readJson<EdgeMode>(EDGE_MODE_KEY, 'summary'),
  regimenView: readJson<RegimenView>(REGIMEN_VIEW_KEY, 'list'),
  printJob: null,
  paletteOpen: false,
  paletteSession: 0,
  helpOpen: false,

  setEdgeMode: (mode) => {
    writeJson(EDGE_MODE_KEY, mode);
    set({ edgeMode: mode });
  },
  setRegimenView: (view) => {
    writeJson(REGIMEN_VIEW_KEY, view);
    set({ regimenView: view });
  },
  print: (job) => {
    set({ printJob: job });
    // let React commit the print view, then open the dialog; reset afterwards
    window.addEventListener('afterprint', () => set({ printJob: null }), { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  },
  setPaletteOpen: (open) =>
    set((s) => ({
      paletteOpen: open,
      helpOpen: false,
      paletteSession: open && !s.paletteOpen ? s.paletteSession + 1 : s.paletteSession,
    })),
  setHelpOpen: (open) => set({ helpOpen: open, paletteOpen: false }),
  addToRegimen: (id) => {
    const s = get();
    if (s.slots.some((x) => x.drug === id)) return;
    if (s.slots[s.active]?.drug === null) s.pick(s.active, id);
    else s.addSlot(id);
  },

  setInspectPair: (pair) => {
    if (pair) pair.forEach((id) => get().ensureNeighbors(id));
    set({ inspectPair: pair });
  },

  setModelChoice: (choice) => {
    try {
      if (choice) localStorage.setItem(MODEL_KEY, JSON.stringify(choice));
      else localStorage.removeItem(MODEL_KEY);
    } catch {
      // storage unavailable (private mode / quota): keep the in-memory choice
    }
    set({ modelChoice: choice });
  },

  overridePair: (a, b, reason) =>
    set((s) => ({
      overrides: { ...s.overrides, [pairKey(a, b)]: { reason, at: new Date().toISOString() } },
    })),

  removeDrug: (drug) => {
    const index = get().slots.findIndex((x) => x.drug === drug);
    if (index >= 0) get().removeSlot(index);
  },

  setDataset: (drugs, stats) => set({ drugs, stats, byId: new Map(drugs.map((d) => [d.id, d])) }),

  pick: (index, id) => {
    get().ensureNeighbors(id);
    set((s) => ({
      slots: s.slots.map((x, i) => (i === index ? { ...x, drug: id } : x)),
      active: index,
      inspectPair: null,
    }));
  },

  setRegimen: (ids) => {
    const known = ids.filter((id) => get().byId.has(id));
    known.forEach((id) => get().ensureNeighbors(id));
    const slots = known.length ? known.map((id) => slot(id)) : [slot(null)];
    set({ slots, active: slots.length - 1, inspectPair: null });
  },

  addSlot: (id) => {
    if (id) get().ensureNeighbors(id);
    set((s) => {
      // reuse a trailing empty column instead of stacking empties
      const last = s.slots.length - 1;
      if (s.slots[last].drug === null) {
        return {
          slots: s.slots.map((x, i) => (i === last ? { ...x, drug: id ?? null } : x)),
          active: last,
        };
      }
      return { slots: [...s.slots, slot(id ?? null)], active: s.slots.length };
    });
  },

  removeSlot: (index) =>
    set((s) => {
      const slots = s.slots.filter((_, i) => i !== index);
      if (slots.length === 0) slots.push(slot(null));
      const active = s.active > index ? s.active - 1 : Math.min(s.active, slots.length - 1);
      return { slots, active };
    }),

  setActive: (index) => set({ active: index }),

  setHover: (id, source) =>
    set((s) =>
      s.hover === id && s.hoverSource === source ? s : { hover: id, hoverSource: id ? source : null },
    ),

  toggleFamily: (family) => set((s) => ({ familyFocus: s.familyFocus === family ? null : family })),

  setSeverityFilter: (severity) => set({ severityFilter: severity }),

  ensureNeighbors: (id) => {
    if (get().neighbors[id] || inflight.has(id)) return;
    inflight.add(id);
    fetchNeighbors(id)
      .then((list) => {
        const map = new Map(list.map((n) => [n.id, n]));
        set((s) => ({ neighbors: { ...s.neighbors, [id]: map } }));
      })
      .catch((err: unknown) => {
        toast.error('Could not load interactions', { description: String(err) });
      })
      .finally(() => inflight.delete(id));
  },

  escape: () => {
    const s = get();
    if (s.hover) return set({ hover: null, hoverSource: null });
    if (s.familyFocus) return set({ familyFocus: null });
    if (s.severityFilter) return set({ severityFilter: null });
    if (s.slots[s.active]?.drug) {
      set({ slots: s.slots.map((x, i) => (i === s.active ? { ...x, drug: null } : x)) });
    }
  },
}));

/** Interaction between two drugs from whichever side's list is loaded. */
export function pairInfo(
  neighbors: Readonly<Record<string, NeighborMap>>,
  a: string,
  b: string,
): { loaded: boolean; info: NeighborInfo | null } {
  const fromA = neighbors[a];
  const fromB = neighbors[b];
  const info = fromA?.get(b) ?? fromB?.get(a) ?? null;
  return { loaded: Boolean(fromA || fromB), info };
}

export function pairSeverity(info: NeighborInfo | null): Severity | null {
  return info ? asSeverity(info.severity) : null;
}

export function activeDrugId(s: Pick<Explorer, 'slots' | 'active'>): string | null {
  return s.slots[s.active]?.drug ?? null;
}

/**
 * The drug the graph fans out from: the active column's pick, else the
 * nearest pick to its left (so adding an empty column keeps the context).
 */
export function focusDrugId(s: Pick<Explorer, 'slots' | 'active'>): string | null {
  for (let i = s.active; i >= 0; i--) if (s.slots[i]?.drug) return s.slots[i].drug;
  return s.slots.find((x) => x.drug)?.drug ?? null;
}

export function pickedIds(slots: readonly Slot[]): string[] {
  return slots.flatMap((x) => (x.drug ? [x.drug] : []));
}
