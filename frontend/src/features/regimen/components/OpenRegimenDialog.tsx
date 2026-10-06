import { useEffect, useState } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { deleteRegimen, errorMessage, listRegimens } from '@/api/regimens';
import type { Regimen } from '@/api/schemas';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

/** Saved regimens: open (restores its overrides) or delete (soft — the audit trail stays). */
export function OpenRegimenDialog() {
  const open = useExplorer((s) => s.regimenDialog === 'open');
  const setDialog = useExplorer((s) => s.setRegimenDialog);
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog(o ? 'open' : null)}>
      <DialogContent className="sm:max-w-lg">{open && <SavedList close={() => setDialog(null)} />}</DialogContent>
    </Dialog>
  );
}

function SavedList({ close }: { close: () => void }) {
  const openRegimen = useExplorer((s) => s.openRegimen);
  const current = useExplorer((s) => s.savedRegimen?.id);
  const name = useDrugName();
  const [data, setData] = useState<{ store: string; regimens: Regimen[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listRegimens(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [tick]);

  const open = (r: Regimen) =>
    openRegimen(r.id)
      .then(close)
      .catch((err: unknown) => toast.error('Could not open the regimen', { description: errorMessage(err) }));
  const remove = (r: Regimen) =>
    deleteRegimen(r.id)
      .then(() => {
        setConfirm(null);
        setTick((t) => t + 1);
      })
      .catch((err: unknown) => toast.error('Could not delete', { description: errorMessage(err) }));

  return (
    <div className="flex flex-col gap-3">
      <DialogHeader>
        <DialogTitle>Saved regimens</DialogTitle>
        <DialogDescription>
          Opening a regimen restores its documented overrides. Shared links never carry overrides.
        </DialogDescription>
      </DialogHeader>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!data && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
      {data && data.regimens.length === 0 && <p className="text-xs text-muted-foreground">Nothing saved yet.</p>}
      {data && data.regimens.length > 0 && (
        <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto rounded-md border">
          {data.regimens.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {r.label}
                  {r.id === current && <span className="ml-1.5 text-[11px] text-primary">open</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.drug_ids.map(name).join(', ')} · {new Date(r.updated_at).toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void open(r)}>
                <FolderOpen /> Open
              </Button>
              {confirm === r.id ? (
                <Button size="sm" variant="destructive" onClick={() => void remove(r)}>
                  Delete?
                </Button>
              ) : (
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.label}`} onClick={() => setConfirm(r.id)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data?.store === 'memory' && (
        <p className="text-[11px] text-muted-foreground">
          Stored in memory on the server (lost on restart). Set APP_DATABASE_URL to keep regimens and the audit trail in
          Postgres.
        </p>
      )}
    </div>
  );
}
