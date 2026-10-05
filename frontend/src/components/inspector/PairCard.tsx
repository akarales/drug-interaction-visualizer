import { useState } from 'react';
import { ArrowLeftRight, Copy, FileText, Loader2, MessageSquareText, Printer, Stethoscope, X } from 'lucide-react';
import { toast } from 'sonner';

import { postExplain } from '@/api/client';
import type { ExplanationPayload, ExplanationResponse } from '@/api/types';
import { handoutText } from '@/lib/handout';
import { ModelChooser } from '@/components/insights/ModelChooser';
import { SeverityChip } from '@/components/SeverityChip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TIER_ACTION, asSeverity, basisLabel, kindLabel, type Severity } from '@/lib/domain';
import { pairInfo, useExplorer } from '@/state/explorer';

/**
 * The seven DDI decision-support elements (Payne et al., JAMIA 2015):
 * drugs, seriousness, clinical consequence, mechanism, modifying factors,
 * recommended action, evidence — plus an optional AI explanation that is
 * grounded in the same record and can never change its severity.
 */
export function PairCard({ a, b, pinned }: { a: string; b: string; pinned: boolean }) {
  const byId = useExplorer((s) => s.byId);
  const neighbors = useExplorer((s) => s.neighbors);
  const modelChoice = useExplorer((s) => s.modelChoice);
  const setInspectPair = useExplorer((s) => s.setInspectPair);
  const { loaded, info } = pairInfo(neighbors, a, b);
  const name = (id: string) => byId.get(id)?.name ?? id;

  // explanations cached per pair + model; only the current key is ever shown
  const modelKey = modelChoice ? `${modelChoice.provider}:${modelChoice.model}` : 'default';
  const key = `${a}|${b}|${modelKey}`;
  const [results, setResults] = useState<Record<string, ExplanationResponse>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<{ key: string; message: string } | null>(null);
  const explanation = results[key];

  const explain = () => {
    const requested = key;
    setBusyKey(requested);
    setErrorKey(null);
    postExplain(a, b, modelChoice, 'both')
      .then((res) => setResults((r) => ({ ...r, [requested]: res })))
      .catch((err: unknown) =>
        setErrorKey({ key: requested, message: err instanceof Error ? err.message : String(err) }),
      )
      .finally(() => setBusyKey((k) => (k === requested ? null : k)));
  };

  const severity = info ? asSeverity(info.severity) : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name(a)} <ArrowLeftRight className="inline size-3.5 text-muted-foreground" aria-label="and" />{' '}
          {name(b)}
        </p>
        {pinned && (
          <Button size="icon-xs" variant="ghost" aria-label="Unpin pair" onClick={() => setInspectPair(null)}>
            <X />
          </Button>
        )}
      </div>

      {!loaded && <Skeleton className="h-24 w-full" />}
      {loaded && !info && (
        <p className="rounded-md border border-dashed p-2.5 text-xs leading-relaxed text-muted-foreground">
          No interaction between these drugs was found in this dataset. Absence from one pairwise
          dataset is not a safety claim — dose, patient factors and multi-drug effects are not
          covered.
        </p>
      )}
      {info && severity && (
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2.5 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Seriousness</dt>
          <dd>
            <SeverityChip severity={severity} />
          </dd>
          <dt className="text-muted-foreground">Consequence</dt>
          <dd>{kindLabel(info.kind)}</dd>
          <dt className="text-muted-foreground">Mechanism</dt>
          <dd className="leading-relaxed">{info.mechanism}</dd>
          <dt className="text-muted-foreground">Modifying factors</dt>
          <dd className="text-muted-foreground">Not in this dataset (dose, duration, patient factors).</dd>
          <dt className="text-muted-foreground">Action</dt>
          <dd>
            {TIER_ACTION[severity]}{' '}
            <span className="text-[10px] text-muted-foreground">(editorial, by tier)</span>
          </dd>
          <dt className="text-muted-foreground">Evidence</dt>
          <dd className="text-muted-foreground">{basisLabel(info.severity_basis)} · DrugBank-derived</dd>
        </dl>
      )}

      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
        <ModelChooser />
        <Button size="sm" onClick={explain} disabled={busyKey === key || !loaded}>
          {busyKey === key ? <Loader2 className="animate-spin" /> : <MessageSquareText />}
          {explanation ? 'Explain again' : 'Explain for clinician + patient'}
        </Button>
        {busyKey === key && (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {errorKey?.key === key && <p className="text-xs text-destructive">{errorKey.message}</p>}
        {explanation && busyKey !== key && (
          <GeneratedSections
            a={a}
            b={b}
            explanation={explanation}
            severity={severity}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Both AI sections from one call: the clinician read (summary, mechanism,
 * monitoring & management) and a patient handout draft the clinician can
 * review, copy into a note/portal message, or print with a sign-off line.
 */
function GeneratedSections({
  a,
  b,
  explanation,
  severity,
}: {
  a: string;
  b: string;
  explanation: ExplanationResponse;
  severity: Severity | null;
}) {
  const byId = useExplorer((s) => s.byId);
  const print = useExplorer((s) => s.print);
  const name = (id: string) => byId.get(id)?.name ?? id;
  const clinician = explanation.sections?.clinician ?? (explanation.audience !== 'patient' ? explanation.payload : undefined);
  const patient = explanation.sections?.patient;
  const model = `${explanation.provider ?? 'llm'} / ${explanation.model}`;

  const copy = (section: ExplanationPayload) =>
    navigator.clipboard
      .writeText(handoutText(name(a), name(b), severity, section))
      .then(() => toast.success('Patient handout copied', { description: 'Review it before sharing.' }))
      .catch(() => toast.error('Could not copy the handout'));

  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed">
      {clinician && (
        <section aria-label="For the clinician" className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <Stethoscope className="size-3.5" /> For you (clinician)
          </h4>
          <p>{clinician.explanation}</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/80">Mechanism: </span>
            {clinician.mechanism}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/80">Monitoring &amp; management: </span>
            {clinician.recommendation}
          </p>
        </section>
      )}
      {patient && (
        <section aria-label="Patient handout" className="flex flex-col gap-1.5 rounded-md border border-dashed p-2.5">
          <div className="flex items-center gap-1.5">
            <h4 className="flex flex-1 items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              <FileText className="size-3.5" /> For the patient — draft, review before sharing
            </h4>
            <Button size="icon-xs" variant="ghost" aria-label="Copy patient handout" onClick={() => copy(patient)}>
              <Copy />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Print patient handout"
              onClick={() => print({ kind: 'handout', a, b, severity, section: patient, model })}
            >
              <Printer />
            </Button>
          </div>
          <p>{patient.explanation}</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/80">How they affect each other: </span>
            {patient.mechanism}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/80">What to watch for: </span>
            {patient.recommendation}
          </p>
        </section>
      )}
      <p className="text-[10px] text-muted-foreground">
        {model} · grounded in the dataset record · severity stays the dataset&apos;s · decision support,
        not a substitute for clinical judgement
      </p>
    </div>
  );
}
