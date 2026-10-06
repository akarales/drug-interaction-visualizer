import { Copy, FileText, Printer, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';

import type { ExplanationPayload } from '@/api/schemas';
import { Button } from '@/components/ui/button';
import type { Severity } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';

import { handoutText } from './handout/handout';
import type { Sections } from './useExplainStream';

const complete = (s: Partial<ExplanationPayload> | undefined): s is ExplanationPayload =>
  Boolean(s && s.explanation && s.severity && s.mechanism && s.recommendation);

/**
 * Both AI sections from one call: the clinician read (summary, mechanism,
 * monitoring & management) and a patient handout draft the clinician can
 * review, copy into a note/portal message, or print with a sign-off line.
 * While streaming, text grows in place and copy/print wait for the
 * validated final payload (`final`).
 */
export function GeneratedSections({
  a,
  b,
  sections,
  model,
  disclaimer,
  severity,
  final,
}: {
  a: string;
  b: string;
  sections: Sections;
  model: string;
  disclaimer?: string;
  severity: Severity | null;
  final: boolean;
}) {
  const print = useExplorer((s) => s.print);
  const name = useDrugName();
  const { clinician, patient } = sections;

  const copy = (section: ExplanationPayload) =>
    navigator.clipboard
      .writeText(handoutText(name(a), name(b), severity, section))
      .then(() => toast.success('Patient handout copied', { description: 'Review it before sharing.' }))
      .catch(() => toast.error('Could not copy the handout'));

  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed" aria-busy={!final}>
      {clinician && (
        <section aria-label="For the clinician" className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <Stethoscope className="size-3.5" /> For you (clinician)
          </h4>
          <p>{clinician.explanation}</p>
          {clinician.mechanism && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground/80">Mechanism: </span>
              {clinician.mechanism}
            </p>
          )}
          {clinician.recommendation && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground/80">Monitoring &amp; management: </span>
              {clinician.recommendation}
            </p>
          )}
        </section>
      )}
      {patient && (
        <section aria-label="Patient handout" className="flex flex-col gap-1.5 rounded-md border border-dashed p-2.5">
          <div className="flex items-center gap-1.5">
            <h4 className="flex flex-1 items-center gap-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              <FileText className="size-3.5" /> For the patient — draft, review before sharing
            </h4>
            {final && complete(patient) && (
              <>
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
              </>
            )}
          </div>
          <p>{patient.explanation}</p>
          {patient.mechanism && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground/80">How they affect each other: </span>
              {patient.mechanism}
            </p>
          )}
          {patient.recommendation && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground/80">What to watch for: </span>
              {patient.recommendation}
            </p>
          )}
        </section>
      )}
      <p className="text-[11px] text-muted-foreground">
        {final ? model : `${model} · writing…`} · grounded in the dataset record · severity stays the dataset&apos;s ·
        decision support, not a substitute for clinical judgement
        {disclaimer && <span className="mt-0.5 block">{disclaimer}</span>}
      </p>
    </div>
  );
}
