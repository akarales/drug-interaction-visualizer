import type { StateCreator } from 'zustand';

import { pairKey } from '../selectors';
import type { Store } from '../store';
import type { Override, Slot } from '../types';

export interface RegimenSlice {
  /** Medication columns, left to right. */
  slots: Slot[];
  /** Index of the column that receives graph clicks / keyboard. */
  active: number;
  /** Contraindicated pairs the user chose to keep, with the reason. */
  overrides: Readonly<Record<string, Override>>;
  /** Pair pinned in the inspector's pair card; null = worst regimen pair. */
  inspectPair: readonly [string, string] | null;

  pick(slot: number, id: string): void;
  /** Replace the whole regimen (URL restore / history navigation). */
  setRegimen(ids: readonly string[]): void;
  addSlot(id?: string): void;
  removeSlot(slot: number): void;
  /** Reorder: move the column at `from` to `to` (regimen order = URL order). */
  moveSlot(from: number, to: number): void;
  setActive(slot: number): void;
  /** Remove the column holding `drug` (used by "remove" in the alert). */
  removeDrug(drug: string): void;
  /** Add a drug the way the palette does: fill the active empty column, else a new one. */
  addToRegimen(id: string): void;
  overridePair(a: string, b: string, reason: string): void;
  setInspectPair(pair: readonly [string, string] | null): void;
}

let nextKey = 1;
const slot = (drug: string | null): Slot => ({ key: nextKey++, drug });

export const createRegimenSlice: StateCreator<Store, [], [], RegimenSlice> = (set, get) => ({
  slots: [slot(null)],
  active: 0,
  overrides: {},
  inspectPair: null,

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

  moveSlot: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.slots.length || to >= s.slots.length) return s;
      const slots = [...s.slots];
      const [moved] = slots.splice(from, 1);
      slots.splice(to, 0, moved);
      // the active column follows its slot
      const activeKey = s.slots[s.active]?.key;
      return { slots, active: Math.max(0, slots.findIndex((x) => x.key === activeKey)) };
    }),

  setActive: (index) => set({ active: index }),

  removeDrug: (drug) => {
    const index = get().slots.findIndex((x) => x.drug === drug);
    if (index >= 0) get().removeSlot(index);
  },

  addToRegimen: (id) => {
    const s = get();
    if (s.slots.some((x) => x.drug === id)) return;
    if (s.slots[s.active]?.drug === null) s.pick(s.active, id);
    else s.addSlot(id);
  },

  overridePair: (a, b, reason) =>
    set((s) => ({
      overrides: { ...s.overrides, [pairKey(a, b)]: { reason, at: new Date().toISOString() } },
    })),

  setInspectPair: (pair) => {
    if (pair) pair.forEach((id) => get().ensureNeighbors(id));
    set({ inspectPair: pair });
  },
});
