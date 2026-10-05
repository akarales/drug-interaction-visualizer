/**
 * Domain vocabulary shared by the graph, the medication columns and chips.
 * One colour semantic everywhere:
 *   family hue = what kind of interactions a drug mostly has (node fill)
 *   severity   = how serious a pair is (edges, chips) — EDITORIAL grading
 * Hex values (not oklch) because the WebGL renderer parses them directly;
 * they mirror the --sev-* / --fam-* tokens in index.css.
 */

export const SEVERITIES = ['contraindicated', 'severe', 'moderate', 'mild'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  contraindicated: 3,
  severe: 2,
  moderate: 1,
  mild: 0,
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  contraindicated: '#ff3864',
  severe: '#ff9e7a',
  moderate: '#8e97a8',
  mild: '#35d0b0',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  contraindicated: 'Contraindicated',
  severe: 'Severe',
  moderate: 'Moderate',
  mild: 'Mild',
};

/** Editorial guidance per tier (not drug-specific; labelled as such in the UI). */
export const TIER_ACTION: Record<Severity, string> = {
  contraindicated: 'Avoid concurrent use; choose an alternative to one of the drugs.',
  severe: 'Avoid if possible, or use only with close monitoring; consider alternatives.',
  moderate: 'Monitor; a dose or timing adjustment may be needed depending on the drugs.',
  mild: 'Usually no action needed; be aware of the effect.',
};

export function asSeverity(value: string): Severity {
  return (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : 'moderate';
}

export function worse(a: Severity | null, b: Severity): Severity {
  return a === null || SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

/** Human description of where a severity grade came from. */
export function basisLabel(basis: string | undefined): string {
  if (!basis) return 'editorial grade';
  if (basis.startsWith('onc:')) return `ONC high-priority DDI #${basis.slice(4)} (Phansalkar 2012)`;
  if (basis.startsWith('default:')) return 'default grade (kind not in reviewed table)';
  return `graded by interaction kind (${basis.replace(/^kind:/, '').replace('activity:', '')})`;
}

export const FAMILIES = ['pk', 'cardiac', 'cns', 'pd-other', 'clinical'] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_COLOR: Record<Family, string> = {
  pk: '#56b4e9',
  cardiac: '#e69f00',
  cns: '#b794f4',
  'pd-other': '#8bd17c',
  clinical: '#7d8aa3',
};

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

/** Common names → dataset ids (DrugBank uses INN / chemical names). */
const ALIASES: Record<string, string> = {
  aspirin: 'acetylsalicylic-acid',
  asa: 'acetylsalicylic-acid',
  paracetamol: 'acetaminophen',
  adrenaline: 'epinephrine',
  noradrenaline: 'norepinephrine',
  albuterol: 'salbutamol',
  ciclosporin: 'cyclosporine',
  glibenclamide: 'glyburide',
  frusemide: 'furosemide',
  lignocaine: 'lidocaine',
  rifampin: 'rifampicin',
  valproate: 'valproic-acid',
};

/** Dataset ids whose common name starts with the query. */
export function aliasIds(query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const out = new Set<string>();
  if (q.length < 2) return out;
  for (const [alias, id] of Object.entries(ALIASES)) if (alias.startsWith(q)) out.add(id);
  return out;
}

export function kindLabel(kind: string): string {
  return kind.replace(/^activity:/, '').replace(/-/g, ' ');
}

/** Blend a hex colour toward a background hex (t = share of the colour). */
export function mixHex(color: string, background: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [c, b] = [parse(color), parse(background)];
  return `#${c
    .map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0'))
    .join('')}`;
}
