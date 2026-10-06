import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/regimens';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePicks, useExplorer } from '@/state';

/** Name and save the current regimen (or save changes to the open one). */
export function SaveRegimenDialog() {
  const open = useExplorer((s) => s.regimenDialog === 'save');
  const setDialog = useExplorer((s) => s.setRegimenDialog);
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog(o ? 'save' : null)}>
      <DialogContent className="sm:max-w-md">{open && <SaveForm close={() => setDialog(null)} />}</DialogContent>
    </Dialog>
  );
}

function SaveForm({ close }: { close: () => void }) {
  const saved = useExplorer((s) => s.savedRegimen);
  const overrides = useExplorer((s) => Object.keys(s.overrides).length);
  const saveRegimen = useExplorer((s) => s.saveRegimen);
  const picks = usePicks();
  const [label, setLabel] = useState(saved?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    setError(null);
    saveRegimen(label)
      .then(() => {
        toast.success(saved ? 'Changes saved' : 'Regimen saved', { description: label.trim() });
        close();
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{saved ? 'Save changes' : 'Save regimen'}</DialogTitle>
        <DialogDescription>
          {picks.length} medication{picks.length === 1 ? '' : 's'}
          {!saved && overrides > 0 && ` · ${overrides} documented override${overrides === 1 ? '' : 's'} go with it`}
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-xs font-medium">
        Label
        <input
          autoFocus
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Anticoagulation review 3"
          aria-describedby="save-label-help"
          className="h-8 rounded-md border bg-background/60 px-2.5 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <span id="save-label-help" className="font-normal text-muted-foreground">
          Demo with synthetic data only — never enter patient names, dates of birth or record numbers.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || label.trim().length === 0 || picks.length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
