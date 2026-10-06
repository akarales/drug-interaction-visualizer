import type { ExplanationPayload, NeighborInfo } from '@/api/schemas';
import type { Severity } from '@/shared/domain';

/** summary = severe edges individually + other edges bundled per family */
export type EdgeMode = 'summary' | 'all';
export type RegimenView = 'list' | 'matrix';
export type NeighborMap = ReadonlyMap<string, NeighborInfo>;
export type HoverSource = 'graph' | 'list';

/** One medication column; `key` is stable across removals. */
export interface Slot {
  key: number;
  drug: string | null;
}

/** Recorded decision to keep a contraindicated pair (CPOE-style override). */
export interface Override {
  reason: string;
  at: string;
}

/** What window.print() renders: the regimen report, or a patient handout. */
export type PrintJob = {
  kind: 'handout';
  a: string;
  b: string;
  severity: Severity | null;
  section: ExplanationPayload;
  model: string;
};
