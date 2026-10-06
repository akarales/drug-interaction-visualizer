import { create } from 'zustand';

import { createDatasetSlice, type DatasetSlice } from './slices/dataset';
import { createRegimenSlice, type RegimenSlice } from './slices/regimen';
import { createSavedSlice, type SavedSlice } from './slices/saved';
import { createUiSlice, type UiSlice } from './slices/ui';
import { createViewSlice, type ViewSlice } from './slices/view';

export type Store = DatasetSlice & RegimenSlice & SavedSlice & ViewSlice & UiSlice;

/**
 * Interaction state for the whole app, composed from slices (dataset ·
 * regimen · saved · view · ui). The graph renderer subscribes to this store OUTSIDE
 * React (hover never re-renders the graph component); list rows subscribe
 * with narrow selectors so only affected rows render.
 */
export const useExplorer = create<Store>()((...a) => ({
  ...createDatasetSlice(...a),
  ...createRegimenSlice(...a),
  ...createSavedSlice(...a),
  ...createViewSlice(...a),
  ...createUiSlice(...a),
}));
