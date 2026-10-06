import type { StateCreator } from 'zustand';

import type { ModelChoice } from '@/api/llm';
import { readJson } from '@/shared/storage';

import type { Store } from '../store';
import type { PrintJob } from '../types';

const MODEL_KEY = 'ddi.model-choice';

export interface UiSlice {
  /** null = the regimen report */
  printJob: PrintJob | null;
  /** ⌘K command palette / `?` shortcut overlay */
  paletteOpen: boolean;
  /** increments on every open so the palette body remounts with an empty query */
  paletteSession: number;
  helpOpen: boolean;
  /** LLM provider + model for explanations; null = server default. */
  modelChoice: ModelChoice | null;

  /** Render a print job and open the browser print dialog. */
  print(job: PrintJob | null): void;
  setPaletteOpen(open: boolean): void;
  setHelpOpen(open: boolean): void;
  setModelChoice(choice: ModelChoice | null): void;
}

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set) => ({
  printJob: null,
  paletteOpen: false,
  paletteSession: 0,
  helpOpen: false,
  modelChoice: readJson<ModelChoice | null>(MODEL_KEY, null),

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

  setModelChoice: (choice) => {
    try {
      if (choice) localStorage.setItem(MODEL_KEY, JSON.stringify(choice));
      else localStorage.removeItem(MODEL_KEY);
    } catch {
      // storage unavailable (private mode / quota): keep the in-memory choice
    }
    set({ modelChoice: choice });
  },
});
