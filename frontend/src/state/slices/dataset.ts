import { toast } from 'sonner';
import type { StateCreator } from 'zustand';

import { fetchNeighbors } from '@/api/drugs';
import type { DatasetStats, DrugSummary, Source } from '@/api/schemas';

import { pickedIds } from '../selectors';
import type { Store } from '../store';
import type { NeighborMap } from '../types';

/** Interaction lists kept in memory (each ~140 KB raw for hub drugs). */
export const NEIGHBOR_CACHE_MAX = 64;

export interface DatasetSlice {
  drugs: DrugSummary[];
  byId: ReadonlyMap<string, DrugSummary>;
  stats: DatasetStats | null;
  /** citation for the FDA precipitant → object links (null until loaded) */
  directionSource: Source | null;
  /**
   * Interaction lists by drug id. Never overwritten (a panel can never show
   * one drug's interactions under another drug's name); oldest entries are
   * evicted past NEIGHBOR_CACHE_MAX, except drugs in use (regimen, pinned pair).
   */
  neighbors: Readonly<Record<string, NeighborMap>>;
  setDataset(drugs: DrugSummary[], stats: DatasetStats, directionSource?: Source | null): void;
  ensureNeighbors(id: string): void;
}

const inflight = new Set<string>();

export const createDatasetSlice: StateCreator<Store, [], [], DatasetSlice> = (set, get) => ({
  drugs: [],
  byId: new Map(),
  stats: null,
  directionSource: null,
  neighbors: {},

  setDataset: (drugs, stats, directionSource = null) =>
    set({ drugs, stats, directionSource, byId: new Map(drugs.map((d) => [d.id, d])) }),

  ensureNeighbors: (id) => {
    if (get().neighbors[id] || inflight.has(id)) return;
    inflight.add(id);
    fetchNeighbors(id)
      .then((list) => {
        const map: NeighborMap = new Map(list.map((n) => [n.id, n]));
        set((s) => {
          const next: Record<string, NeighborMap> = { ...s.neighbors, [id]: map };
          const keys = Object.keys(next);
          if (keys.length > NEIGHBOR_CACHE_MAX) {
            const keep = new Set([id, ...pickedIds(s.slots), ...(s.inspectPair ?? [])]);
            let excess = keys.length - NEIGHBOR_CACHE_MAX;
            for (const k of keys) {
              if (excess === 0) break;
              if (keep.has(k)) continue;
              delete next[k];
              excess -= 1;
            }
          }
          return { neighbors: next };
        });
      })
      .catch((err: unknown) => {
        toast.error('Could not load interactions', { description: String(err) });
      })
      .finally(() => inflight.delete(id));
  },
});
