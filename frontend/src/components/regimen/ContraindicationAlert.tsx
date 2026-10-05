import { useMemo, useState } from 'react';
import { OctagonAlert } from 'lucide-react';

import { SeverityChip } from '@/components/SeverityChip';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { basisLabel, kindLabel } from '@/lib/domain';
import type { NeighborInfo } from '@/api/types';
import {
  pairInfo,
  pairKey,
  useExplorer,
  type NeighborMap,
  type Override,
  type Slot,
} from '@/state/explorer';

const REASONS = [
  'Benefit outweighs risk — will monitor closely',
  'Patient already tolerating this combination',
  'Specialist recommendation',
  'Other',
] as const;

/** First unacknowledged contraindicated pair; `newer` = the later column. */
function firstPending(
  slots: readonly Slot[],
  neighbors: Readonly<Record<string, NeighborMap>>,
  overrides: Readonly<Record<string, Override>>,
): { older: string; newer: string; info: NeighborInfo } | null {
  const picks = slots.flatMap((x) => (x.drug ? [x.drug] : []));
  for (let j = 1; j < picks.length; j++)
    for (let i = 0; i < j; i++) {
      const { info } = pairInfo(neighbors, picks[i], picks[j]);
      if (info?.severity === 'contraindicated' && !overrides[pairKey(picks[i], picks[j])])
        return { older: picks[i], newer: picks[j], info };
    }
  return null;
}

/**
 * Tiered alerting (Paterno et al., JAMIA 2009): only CONTRAINDICATED pairs
 * interrupt. Content follows the seven DDI CDS elements (Payne et al.,
 * JAMIA 2015): drugs, seriousness, consequence, mechanism, modifying
 * factors, recommended action, evidence. The safe action is the default;
 * keeping the pair requires a documented reason (soft stop, not a hard
 * block). Escape does not dismiss — a decision is required.
 */
export function ContraindicationAlert() {
  const slots = useExplorer((s) => s.slots);
  const neighbors = useExplorer((s) => s.neighbors);
  const overrides = useExplorer((s) => s.overrides);
  const byId = useExplorer((s) => s.byId);
  const removeDrug = useExplorer((s) => s.removeDrug);
  const overridePair = useExplorer((s) => s.overridePair);

  const pending = useMemo(
    () => firstPending(slots, neighbors, overrides),
    [slots, neighbors, overrides],
  );

  const [reason, setReason] = useState<string>('');
  const [other, setOther] = useState('');
  const [forKey, setForKey] = useState('');

  const key = pending ? pairKey(pending.older, pending.newer) : '';
  if (key !== forKey) {
    // a different pair is being alerted: reset the form during render
    setForKey(key);
    setReason('');
    setOther('');
  }
  if (!pending) return null;

  const name = (id: string) => byId.get(id)?.name ?? id;
  const finalReason = reason === 'Other' ? other.trim() : reason;

  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-w-lg border-destructive/60"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <OctagonAlert className="size-5" aria-hidden />
            Contraindicated combination
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-foreground">
            <span className="font-semibold">{name(pending.newer)}</span> should not be used with{' '}
            <span className="font-semibold">{name(pending.older)}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
          <dt className="text-muted-foreground">Seriousness</dt>
          <dd>
            <SeverityChip severity="contraindicated" />
          </dd>
          <dt className="text-muted-foreground">Consequence</dt>
          <dd>{kindLabel(pending.info.kind)}</dd>
          <dt className="text-muted-foreground">Mechanism</dt>
          <dd className="leading-relaxed">{pending.info.mechanism}</dd>
          <dt className="text-muted-foreground">Modifying factors</dt>
          <dd className="text-muted-foreground">Dose, duration and patient factors are not in this dataset.</dd>
          <dt className="text-muted-foreground">Recommended action</dt>
          <dd>Avoid concurrent use; choose an alternative to one of the drugs.</dd>
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="text-muted-foreground">{basisLabel(pending.info.severity_basis)} · DrugBank-derived text</dd>
        </dl>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium">To keep both, document a reason</legend>
          <RadioGroup value={reason} onValueChange={setReason} className="gap-1.5">
            {REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem id={`ci-${r}`} value={r} />
                <Label htmlFor={`ci-${r}`} className="text-xs font-normal">
                  {r}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {reason === 'Other' && (
            <Textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Describe the reason…"
              className="min-h-16 text-xs"
              aria-label="Other override reason"
            />
          )}
        </fieldset>

        <AlertDialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            disabled={!finalReason}
            onClick={() => overridePair(pending.older, pending.newer, finalReason)}
          >
            Override &amp; keep both
          </Button>
          {/* no autoFocus: the alert often opens on the same Enter keystroke
              that picked the drug — a focused button would swallow it */}
          <Button variant="destructive" onClick={() => removeDrug(pending.newer)}>
            Remove {name(pending.newer)}
          </Button>
        </AlertDialogFooter>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Demo decision support on DrugBank-derived data with editorial severity — not medical advice.
        </p>
      </AlertDialogContent>
    </AlertDialog>
  );
}
