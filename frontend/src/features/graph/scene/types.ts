import type { Family, Severity } from '@/shared/domain';

/** Invisible family centroids that summary arcs attach to. */
export const ANCHOR_PREFIX = '__family:';

export interface NodeAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  dimColor: string;
  family: Family;
  label: string;
  type: 'ring';
  /** invisible family centroid that summary arcs attach to */
  anchor: boolean;
  ringCi: number;
  ringSevere: number;
  ringRest: number;
}

export interface EdgeAttrs {
  size: number;
  color: string;
  severity: Severity;
  regimen: boolean;
  /** an individual focus→neighbour edge (hidden in summary mode unless severe) */
  fan: boolean;
  curvature: number;
  /** sigma edge program: plain curve, or an arrow for FDA-directed regimen pairs */
  type?: 'curve' | 'curvedArrow' | 'curvedDoubleArrow';
}

/** What the reducers read on every frame; written by the store sync. */
export interface View {
  hover: string | null;
  regimen: ReadonlySet<string>;
  /** nodes kept bright (active drug's neighbours + regimen); null = all */
  lit: ReadonlySet<string> | null;
  hideUnlit: boolean;
  family: Family | null;
  summary: boolean;
}

export type RingData = { ringColor?: string; ringCi?: number; ringSevere?: number };
