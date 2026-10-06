import { toast } from 'sonner';
import type { StateCreator } from 'zustand';

import { appendOverride, createRegimen, errorMessage, getRegimen, updateRegimen } from '@/api/regimens';

import { pairKey, pickedIds } from '../selectors';
import type { Store } from '../store';

export interface SavedRegimenRef {
  id: string;
  label: string;
  /** saved against the dataset build currently loaded */
  currentDataset: boolean;
}

export interface SavedSlice {
  /** The saved regimen currently open (null = unsaved / opened from a link). */
  savedRegimen: SavedRegimenRef | null;
  /** Save / open dialogs (opened from the rail header or the palette). */
  regimenDialog: 'save' | 'open' | null;

  setRegimenDialog(dialog: 'save' | 'open' | null): void;
  /** Keep a contraindicated pair: closes the alert now and appends an audit event. */
  recordOverride(a: string, b: string, reason: string): void;
  /** Withdraw an override: the alert fires again; the trail keeps both events. */
  revokeOverride(a: string, b: string, reason: string): Promise<void>;
  /** Save the current regimen (new, or changes to the open one). */
  saveRegimen(label: string): Promise<void>;
  /** Load a saved regimen and the overrides in force on it. */
  openRegimen(id: string): Promise<void>;
}

export const createSavedSlice: StateCreator<Store, [], [], SavedSlice> = (set, get) => ({
  savedRegimen: null,
  regimenDialog: null,

  setRegimenDialog: (dialog) => set({ regimenDialog: dialog }),

  recordOverride: (a, b, reason) => {
    get().overridePair(a, b, reason);
    appendOverride({ drug_a: a, drug_b: b, reason, regimen_id: get().savedRegimen?.id ?? null }).catch((err: unknown) =>
      toast.error('Override kept, but not written to the audit trail', { description: errorMessage(err) }),
    );
  },

  revokeOverride: async (a, b, reason) => {
    await appendOverride({ drug_a: a, drug_b: b, reason, action: 'revoke', regimen_id: get().savedRegimen?.id ?? null });
    set((s) => {
      const next = { ...s.overrides };
      delete next[pairKey(a, b)];
      return { overrides: next };
    });
  },

  saveRegimen: async (label) => {
    const s = get();
    const picks = [...new Set(pickedIds(s.slots))];
    const saved = s.savedRegimen
      ? await updateRegimen(s.savedRegimen.id, label, picks)
      : await createRegimen(
          label,
          picks,
          // carry the overrides decided so far into the saved regimen's own trail
          Object.entries(s.overrides).flatMap(([key, o]) => {
            const [a, b] = key.split('|');
            return picks.includes(a) && picks.includes(b) ? [{ drug_a: a, drug_b: b, reason: o.reason }] : [];
          }),
        );
    set({ savedRegimen: { id: saved.id, label: saved.label, currentDataset: true } });
  },

  openRegimen: async (id) => {
    const detail = await getRegimen(id);
    get().setRegimen(detail.regimen.drug_ids);
    set({
      savedRegimen: { id: detail.regimen.id, label: detail.regimen.label, currentDataset: detail.current_dataset },
      overrides: Object.fromEntries(
        detail.active_overrides.map((e) => [pairKey(e.drug_a, e.drug_b), { reason: e.reason, at: e.created_at }]),
      ),
    });
  },
});
