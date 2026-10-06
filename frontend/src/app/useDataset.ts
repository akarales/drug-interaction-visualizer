import { useEffect } from 'react';
import { toast } from 'sonner';

import { fetchDrugs } from '@/api/drugs';
import { useExplorer } from '@/state';
import { startUrlSync } from '@/state/history';

/** Load the dataset once, then start syncing the regimen with `?meds=`. */
export function useDataset(): void {
  useEffect(() => {
    const controller = new AbortController();
    let stopUrlSync: (() => void) | undefined;
    fetchDrugs(controller.signal)
      .then((body) => {
        useExplorer.getState().setDataset(body.drugs, body.stats, body.sources?.direction ?? null);
        // ?meds=… can only be restored once drug ids are known
        stopUrlSync = startUrlSync();
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          toast.error('Failed to load dataset', { description: String(err) });
      });
    return () => {
      controller.abort();
      stopUrlSync?.();
    };
  }, []);
}
