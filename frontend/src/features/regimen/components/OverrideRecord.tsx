import { useEffect, useState } from 'react';
import { History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { errorMessage, fetchAudit } from '@/api/regimens';
import type { OverrideEvent } from '@/api/schemas';
import { Button } from '@/components/ui/button';
import { pairKey, useExplorer } from '@/state';

/**
 * The documented decision for a contraindicated pair: the override in force
 * (with a Revoke action) and, for a saved regimen, its append-only history.
 */
export function OverrideRecord({ a, b }: { a: string; b: string }) {
  const override = useExplorer((s) => s.overrides[pairKey(a, b)]);
  const saved = useExplorer((s) => s.savedRegimen);
  const revokeOverride = useExplorer((s) => s.revokeOverride);
  const [history, setHistory] = useState<OverrideEvent[]>([]);
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');

  const [lo, hi] = a < b ? [a, b] : [b, a];
  const overrideAt = override?.at;
  useEffect(() => {
    if (!saved) return;
    let alive = true;
    fetchAudit(saved.id)
      .then((events) => alive && setHistory(events.filter((e) => e.drug_a === lo && e.drug_b === hi)))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [saved, lo, hi, overrideAt]);

  if (!override && history.length === 0) return null;
  const submit = () =>
    revokeOverride(a, b, reason)
      .then(() => {
        setRevoking(false);
        setReason('');
        toast.success('Override revoked', { description: 'The contraindication alert applies again.' });
      })
      .catch((err: unknown) => toast.error('Could not revoke', { description: errorMessage(err) }));

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-2 text-xs">
      {override && (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">Overridden</span> · {override.reason}
            <span className="block text-[11px] text-muted-foreground">{new Date(override.at).toLocaleString()} · demo-clinician</span>
          </p>
          {!revoking && (
            <Button size="xs" variant="ghost" onClick={() => setRevoking(true)}>
              <Undo2 /> Revoke
            </Button>
          )}
        </div>
      )}
      {revoking && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for revoking"
            aria-label="Reason for revoking the override"
            className="h-7 min-w-0 flex-1 rounded-md border bg-background/60 px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          <Button size="xs" type="submit" disabled={reason.trim().length < 3}>
            Revoke
          </Button>
        </form>
      )}
      {history.length > 0 && (
        <ol aria-label="Override audit trail" className="flex flex-col gap-0.5 border-t pt-1.5 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1 font-medium text-foreground/80">
            <History className="size-3" /> Audit trail (append-only)
          </li>
          {history.map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleString()} · {e.action} · {e.reason} · {e.actor}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
