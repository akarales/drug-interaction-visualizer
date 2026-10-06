/**
 * Families — what kind of interactions a drug mostly has (node fill colour),
 * derived from its dominant interaction kind (`category`).
 */

export const FAMILIES = ['pk', 'cardiac', 'cns', 'pd-other', 'clinical'] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Record<Family, string> = {
  pk: 'Pharmacokinetic',
  cardiac: 'Cardiovascular',
  cns: 'CNS',
  'pd-other': 'Other activity',
  clinical: 'Generic / clinical',
};

const PK = new Set(['metabolism', 'exposure', 'absorption', 'excretion', 'bioavailability']);
const CARDIAC = new Set([
  'qtc-prolonging', 'av-block', 'cardiotoxic', 'arrhythmogenic', 'hypertensive', 'hypotensive',
  'antihypertensive', 'orthostatic-hypotensive', 'bradycardic', 'tachycardic', 'vasoconstricting',
  'vasodilatory', 'vasopressor', 'fluid-retaining', 'anticoagulant', 'antiplatelet', 'thrombogenic',
]);
const CNS = new Set([
  'cns-depressant', 'serotonergic', 'neurotoxic', 'central-neurotoxic', 'sedative',
  'neuroexcitatory', 'respiratory-depressant', 'stimulatory', 'anticholinergic', 'antipsychotic',
  'analgesic',
]);
const CLINICAL = new Set(['efficacy', 'adverse-effects', 'unclassified', 'uncategorized']);

/** Family of a drug's dominant interaction kind (its `category`). */
export function familyOf(category: string): Family {
  const base = category.replace(/^activity:/, '');
  if (PK.has(base)) return 'pk';
  if (CARDIAC.has(base)) return 'cardiac';
  if (CNS.has(base)) return 'cns';
  if (CLINICAL.has(base)) return 'clinical';
  return 'pd-other';
}

/** Interaction kind as display text (`activity:qtc-prolonging` → `qtc prolonging`). */
export function kindLabel(kind: string): string {
  return kind.replace(/^activity:/, '').replace(/-/g, ' ');
}
