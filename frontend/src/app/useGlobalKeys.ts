import { useEffect, type RefObject } from 'react';

import type { GraphHandle } from '@/features/graph';
import { useExplorer } from '@/state';

/** F6 / Shift+F6: move focus between the workspace regions (rail → map → right column). */
export function focusNextRegion(step: 1 | -1): void {
  const regions = [...document.querySelectorAll<HTMLElement>('[data-region]')].filter((el) => el.offsetParent !== null);
  if (regions.length === 0) return;
  const current = regions.findIndex((el) => el.contains(document.activeElement));
  const next = regions[(current + step + regions.length) % regions.length] ?? regions[0];
  next.focus();
}

/** Global keyboard shortcuts (documented in features/command/shortcuts.ts). */
export function useGlobalKeys(graphRef: RefObject<GraphHandle | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useExplorer.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.key === 'F6') {
        e.preventDefault();
        focusNextRegion(e.shiftKey ? -1 : 1);
        return;
      }
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]');
      // modal dialogs only — the floating medication card is a non-modal dialog
      const dialogOpen = document.querySelector('[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]');
      if (typing || dialogOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case '/': {
          e.preventDefault();
          const drug = s.slots[s.active]?.drug;
          if (drug && s.collapsedCards[drug]) s.setCardCollapsed(drug, false);
          requestAnimationFrame(() =>
            document.querySelector<HTMLInputElement>(`[data-col-search="${s.active}"]`)?.focus(),
          );
          break;
        }
        case '?':
          s.setHelpOpen(true);
          break;
        case 'e':
        case 'E':
          s.setEdgeMode(s.edgeMode === 'summary' ? 'all' : 'summary');
          break;
        case 'm':
        case 'M':
          s.setRegimenView(s.regimenView === 'list' ? 'matrix' : 'list');
          break;
        case 'f':
        case 'F':
          graphRef.current?.reset();
          break;
        case 'Escape':
          s.escape();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [graphRef]);
}
