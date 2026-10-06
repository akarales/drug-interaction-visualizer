/**
 * Severity vocabulary — how serious a pair is. EDITORIAL grading (reviewed
 * kind table + ONC high-priority pairs), always labelled as such in the UI.
 */

export const SEVERITIES = ['contraindicated', 'severe', 'moderate', 'mild'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<Severity, number> = {
  contraindicated: 3,
  severe: 2,
  moderate: 1,
  mild: 0,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  contraindicated: 'Contraindicated',
  severe: 'Severe',
  moderate: 'Moderate',
  mild: 'Mild',
};

/** Compact chip / matrix labels (text, so colour is never the only channel). */
export const SEVERITY_SHORT: Record<Severity, string> = {
  contraindicated: 'CI',
  severe: 'SEV',
  moderate: 'MOD',
  mild: 'MILD',
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

/** Count interactions per tier (severity bars, focus summary). */
export function severityCounts(items: Iterable<{ severity: string }>): Partial<Record<Severity, number>> {
  const c: Partial<Record<Severity, number>> = {};
  for (const n of items) {
    const s = asSeverity(n.severity);
    c[s] = (c[s] ?? 0) + 1;
  }
  return c;
}

/** Human description of where a severity grade came from. */
export function basisLabel(basis: string | undefined): string {
  if (!basis) return 'editorial grade';
  if (basis.startsWith('onc:')) return `ONC high-priority DDI #${basis.slice(4)} (Phansalkar 2012)`;
  if (basis.startsWith('default:')) return 'default grade (kind not in reviewed table)';
  return `graded by interaction kind (${basis.replace(/^kind:/, '').replace('activity:', '')})`;
}
