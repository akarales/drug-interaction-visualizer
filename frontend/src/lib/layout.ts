import type { DrugSummary } from '@/api/types';
import { FAMILIES, familyOf, type Family } from '@/lib/domain';

export interface Placed {
  x: number;
  y: number;
  size: number;
  family: Family;
}

const GOLDEN = 0.6180339887498949;
const SECTOR_GAP = 0.06; // radians between family sectors
const MIN_SECTOR = 0.16; // minimum share of the circle per family

/**
 * "Rings" lens — deterministic, no physics, computed once per dataset:
 * angle = family sector (share ∝ drug count, floored so small families stay
 * visible); radius = degree rank within the family (hubs at the centre,
 * area-uniform so the disc has even density); within-sector angle uses a
 * golden-ratio sequence to avoid radial streaks. Same input → same picture,
 * so users build spatial memory, and selection never moves a node.
 */
export function ringsLayout(drugs: readonly DrugSummary[]): Map<string, Placed> {
  const groups = new Map<Family, DrugSummary[]>(FAMILIES.map((f) => [f, []]));
  for (const drug of drugs) groups.get(familyOf(drug.category))?.push(drug);

  const present = FAMILIES.filter((f) => (groups.get(f)?.length ?? 0) > 0);
  const raw = present.map((f) => Math.max((groups.get(f)?.length ?? 0) / drugs.length, MIN_SECTOR));
  const total = raw.reduce((a, b) => a + b, 0);
  const usable = Math.PI * 2 - SECTOR_GAP * present.length;

  let maxDegree = 1;
  for (const d of drugs) maxDegree = Math.max(maxDegree, d.degree);

  const out = new Map<string, Placed>();
  let start = -Math.PI / 2;
  present.forEach((family, fi) => {
    const span = (raw[fi] / total) * usable;
    const members = [...(groups.get(family) ?? [])].sort(
      (a, b) => b.degree - a.degree || a.name.localeCompare(b.name),
    );
    members.forEach((drug, rank) => {
      const r = 6 + 94 * Math.sqrt((rank + 0.5) / members.length);
      const t = 0.04 + 0.92 * ((rank * GOLDEN) % 1);
      const angle = start + span * t;
      out.set(drug.id, {
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        size: 1.6 + 6.4 * Math.sqrt(drug.degree / maxDegree),
        family,
      });
    });
    start += span + SECTOR_GAP;
  });
  return out;
}
