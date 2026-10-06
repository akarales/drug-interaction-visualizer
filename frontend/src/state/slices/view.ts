import type { StateCreator } from 'zustand';

import type { Family, Severity } from '@/shared/domain';
import { readJson, writeJson } from '@/shared/storage';

import type { Store } from '../store';
import type { EdgeMode, HoverSource, RegimenView } from '../types';

const EDGE_MODE_KEY = 'ddi.edge-mode';
const REGIMEN_VIEW_KEY = 'ddi.regimen-view';
const COLLAPSED_KEY = 'ddi.card-collapsed';

export interface ViewSlice {
  hover: string | null;
  hoverSource: HoverSource | null;
  familyFocus: Family | null;
  severityFilter: Severity | null;
  edgeMode: EdgeMode;
  regimenView: RegimenView;
  /** Medication cards the user collapsed, by drug id (persisted; never automatic). */
  collapsedCards: Readonly<Record<string, true>>;
  /** Slot key of the card popped out as a floating window; null = all docked. */
  floatingSlot: number | null;

  setCardCollapsed(drug: string, collapsed: boolean): void;
  setFloatingSlot(key: number | null): void;
  setHover(id: string | null, source: HoverSource): void;
  toggleFamily(family: Family): void;
  setSeverityFilter(severity: Severity | null): void;
  setEdgeMode(mode: EdgeMode): void;
  setRegimenView(view: RegimenView): void;
  /** One level per press: hover → family focus → severity filter → active pick. */
  escape(): void;
}

export const createViewSlice: StateCreator<Store, [], [], ViewSlice> = (set, get) => ({
  hover: null,
  hoverSource: null,
  familyFocus: null,
  severityFilter: null,
  edgeMode: readJson<EdgeMode>(EDGE_MODE_KEY, 'summary'),
  regimenView: readJson<RegimenView>(REGIMEN_VIEW_KEY, 'list'),
  collapsedCards: readJson<Record<string, true>>(COLLAPSED_KEY, {}),
  floatingSlot: null,

  setCardCollapsed: (drug, collapsed) =>
    set((s) => {
      const next: Record<string, true> = { ...s.collapsedCards };
      if (collapsed) next[drug] = true;
      else delete next[drug];
      writeJson(COLLAPSED_KEY, next);
      return { collapsedCards: next };
    }),

  setFloatingSlot: (key) => set({ floatingSlot: key }),

  setHover: (id, source) =>
    set((s) =>
      s.hover === id && s.hoverSource === source ? s : { hover: id, hoverSource: id ? source : null },
    ),

  toggleFamily: (family) => set((s) => ({ familyFocus: s.familyFocus === family ? null : family })),

  setSeverityFilter: (severity) => set({ severityFilter: severity }),

  setEdgeMode: (mode) => {
    writeJson(EDGE_MODE_KEY, mode);
    set({ edgeMode: mode });
  },

  setRegimenView: (view) => {
    writeJson(REGIMEN_VIEW_KEY, view);
    set({ regimenView: view });
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
});
