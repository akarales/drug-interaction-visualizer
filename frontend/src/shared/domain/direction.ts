import type { DirectedLink, PairRoles } from '@/api/schemas';

/**
 * Interaction direction (precipitant → object) as given by the FDA
 * CYP/transporter table. `null` everywhere means UNKNOWN — the UI says so
 * and never guesses from the dataset's wording.
 */
export type RoleOfFocus = 'acts' | 'affected' | 'both';

export const ROLE_LABEL: Record<RoleOfFocus, string> = {
  acts: 'Acts on',
  affected: 'Affected by',
  both: 'Both ways',
};

export const ROLE_ARROW: Record<RoleOfFocus, string> = { acts: '→', affected: '←', both: '⇄' };

/** How `focus` relates to the other drug of the pair. */
export function roleOf(focus: string, roles: PairRoles | undefined): RoleOfFocus | null {
  if (!roles) return null;
  if (roles.pattern === 'bidirectional') return 'both';
  return roles.links[0]?.precipitant === focus ? 'acts' : 'affected';
}

const SENSITIVITY: Record<string, string> = {
  sensitive: 'sensitive',
  'moderate-sensitive': 'moderately sensitive',
};

/** "moderate CYP2C9 inhibitor" / "strong CYP3A inducer" / "P-gp inhibitor". */
export function precipitantRole(link: DirectedLink): string {
  const level = link.strength === 'unspecified' ? '' : `${link.strength} `;
  return `${level}${link.pathway} ${link.effect === 'inhibits' ? 'inhibitor' : 'inducer'}`;
}

/** "moderately sensitive CYP2C9 substrate" / "OATP1B1 substrate". */
export function objectRole(link: DirectedLink): string {
  const level = SENSITIVITY[link.object_sensitivity];
  return `${level ? `${level} ` : ''}${link.pathway} substrate`;
}

/** Expected effect on the object's exposure (FDA definitions: inhibitors raise, inducers lower AUC). */
export function exposureEffect(link: DirectedLink): string {
  return link.effect === 'inhibits' ? 'exposure may increase' : 'exposure may decrease';
}

/** One-line plain-text summary, e.g. for CSV and the printed report. */
export function directionText(roles: PairRoles | undefined, name: (id: string) => string): string {
  if (!roles) return 'unknown (not established by the FDA CYP/transporter table)';
  return roles.links
    .map((l) => `${name(l.precipitant)} (${precipitantRole(l)}) → ${name(l.object)} (${objectRole(l)}; ${exposureEffect(l)})`)
    .join('; ');
}
