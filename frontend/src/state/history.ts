import { create } from 'zustand';

import { pickedIds, useExplorer } from '@/state/explorer';

/**
 * Regimen ⇄ URL (`?meds=warfarin,acetylsalicylic-acid`). Every regimen
 * change pushes a history entry, so browser Back/Forward (and Alt+←/→)
 * step through regimens; opening a shared link restores it. Ids are
 * dataset slugs ([a-z0-9-]), so the list needs no extra encoding.
 * Overrides are deliberately NOT in the URL: whoever opens a shared link
 * sees the contraindication alert again and must decide for themselves.
 */
interface HistoryState {
  ddiIdx: number;
  meds: string[];
}

export const useHistoryNav = create<{ canBack: boolean; canForward: boolean }>()(() => ({
  canBack: false,
  canForward: false,
}));

function readMeds(): string[] {
  return (new URL(window.location.href).searchParams.get('meds') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function urlFor(meds: readonly string[]): string {
  const url = new URL(window.location.href);
  if (meds.length) url.searchParams.set('meds', meds.join(','));
  else url.searchParams.delete('meds');
  // keep the comma readable instead of %2C
  return `${url.pathname}${url.search.replace(/%2C/gi, ',')}${url.hash}`;
}

/** Start syncing; call once the dataset is loaded. Returns a stop function. */
export function startUrlSync(): () => void {
  let idx = 0;
  let maxIdx = 0;
  let restoring = false;
  const publish = () => useHistoryNav.setState({ canBack: idx > 0, canForward: idx < maxIdx });
  const restore = (meds: readonly string[]) => {
    restoring = true;
    useExplorer.getState().setRegimen(meds);
    restoring = false;
  };

  const initial = readMeds();
  if (initial.length) restore(initial);
  let last = pickedIds(useExplorer.getState().slots);
  window.history.replaceState({ ddiIdx: 0, meds: last } satisfies HistoryState, '', urlFor(last));
  publish();

  const unsubscribe = useExplorer.subscribe((s, prev) => {
    if (restoring || s.slots === prev.slots) return;
    const meds = pickedIds(s.slots);
    if (meds.join(',') === last.join(',')) return; // e.g. an empty column was added
    last = meds;
    idx += 1;
    maxIdx = idx;
    window.history.pushState({ ddiIdx: idx, meds } satisfies HistoryState, '', urlFor(meds));
    publish();
  });

  const onPopState = (event: PopStateEvent) => {
    const state = event.state as HistoryState | null;
    const meds = state?.meds ?? readMeds();
    idx = state?.ddiIdx ?? 0;
    last = meds;
    restore(meds);
    publish();
  };
  window.addEventListener('popstate', onPopState);
  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopState);
  };
}
