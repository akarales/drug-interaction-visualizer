import type { ExplanationPayload } from '@/api/types';
import type { Severity } from '@/lib/domain';

/** Severity in patient language (the dataset grade, never the model's). */
export const PATIENT_SEVERITY: Record<Severity, string> = {
  contraindicated: 'These medicines should usually not be taken together',
  severe: 'Serious — your care team may want to monitor you or adjust your medicines',
  moderate: 'Moderate — your care team may want to keep an eye on this',
  mild: 'Minor — usually no change is needed',
};

/** Plain-text handout for the clipboard (EHR notes, patient portal messages). */
export function handoutText(
  drugA: string,
  drugB: string,
  severity: Severity | null,
  section: ExplanationPayload,
): string {
  return [
    `Information about your medicines: ${drugA} and ${drugB}`,
    severity ? `How serious: ${PATIENT_SEVERITY[severity]}.` : '',
    '',
    'What may happen',
    section.explanation,
    '',
    'How these medicines affect each other',
    section.mechanism,
    '',
    'What to watch for',
    section.recommendation,
    '',
    'Questions? Ask your doctor or pharmacist. Do not stop or change a medicine without talking to your care team first.',
    'Prepared by your care team with AI assistance from public drug-interaction data. Reviewed by your clinician before sharing.',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
}
