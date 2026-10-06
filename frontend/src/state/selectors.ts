import type { NeighborInfo } from '@/api/schemas';
import { asSeverity, type Severity } from '@/shared/domain';

import type { NeighborMap, Slot } from './types';

/** Order-independent key for a drug pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Interaction between two drugs from whichever side's list is loaded. */
export function pairInfo(
  neighbors: Readonly<Record<string, NeighborMap>>,
  a: string,
  b: string,
): { loaded: boolean; info: NeighborInfo | null } {
  const fromA = neighbors[a];
  const fromB = neighbors[b];
  const info = fromA?.get(b) ?? fromB?.get(a) ?? null;
  return { loaded: Boolean(fromA || fromB), info };
}

export function pairSeverity(info: NeighborInfo | null): Severity | null {
  return info ? asSeverity(info.severity) : null;
}

export function activeDrugId(s: { slots: readonly Slot[]; active: number }): string | null {
  return s.slots[s.active]?.drug ?? null;
}

/**
 * The drug the graph fans out from: the active column's pick, else the
 * nearest pick to its left (so adding an empty column keeps the context).
 */
export function focusDrugId(s: { slots: readonly Slot[]; active: number }): string | null {
  for (let i = s.active; i >= 0; i--) if (s.slots[i]?.drug) return s.slots[i].drug;
  return s.slots.find((x) => x.drug)?.drug ?? null;
}

export function pickedIds(slots: readonly Slot[]): string[] {
  return slots.flatMap((x) => (x.drug ? [x.drug] : []));
}
