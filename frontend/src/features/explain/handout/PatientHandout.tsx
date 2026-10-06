import { useDrugName } from '@/shared/hooks/useDrugName';
import type { PrintJob } from '@/state';

import { PATIENT_SEVERITY } from './handout';

/**
 * Print-only patient handout (window.print → paper / PDF). Black on white,
 * large readable type, a clinician sign-off line: the doctor reviews the AI
 * draft before it goes to the patient.
 */
export function PatientHandout({ job }: { job: PrintJob }) {
  const name = useDrugName();
  const { section, severity } = job;
  return (
    <div id="print-report" className="hidden bg-white font-sans text-[13px] leading-relaxed text-black">
      <header className="mb-5 border-b-2 border-black pb-3">
        <p className="text-[11px] tracking-wider uppercase">Information for patients</p>
        <h1 className="text-2xl font-bold">
          {name(job.a)} and {name(job.b)}
        </h1>
        <p className="text-[11px]">Prepared {new Date().toLocaleDateString()}</p>
      </header>

      {severity && (
        <p className="mb-5 border-2 border-black p-3 text-[14px] font-semibold">
          How serious: {PATIENT_SEVERITY[severity]}.
        </p>
      )}

      <section className="mb-4">
        <h2 className="mb-1 text-[15px] font-bold">What may happen</h2>
        <p>{section.explanation}</p>
      </section>
      <section className="mb-4">
        <h2 className="mb-1 text-[15px] font-bold">How these medicines affect each other</h2>
        <p>{section.mechanism}</p>
      </section>
      <section className="mb-6">
        <h2 className="mb-1 text-[15px] font-bold">What to watch for</h2>
        <p>{section.recommendation}</p>
      </section>

      <p className="mb-8 border-l-4 border-black pl-3">
        Questions? Ask your doctor or pharmacist. Do not stop or change a medicine without talking to
        your care team first.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-8 text-[12px]">
        <p className="border-t border-black pt-1">Reviewed by (clinician)</p>
        <p className="border-t border-black pt-1">Date</p>
      </div>

      <footer className="border-t border-neutral-400 pt-2 text-[10px] text-neutral-700">
        Prepared by your care team with AI assistance ({job.model}) from public, DrugBank-derived
        drug-interaction data, and reviewed by your clinician before sharing. This sheet covers only
        these two medicines; it does not replace advice from your care team.
      </footer>
    </div>
  );
}
