import type { Family } from './family';
import type { Severity } from './severity';

/**
 * The ONE colour source for domain colours. Hex (not oklch) because the
 * WebGL renderer parses them directly; `applyTokenVars()` mirrors every
 * token as a CSS custom property (`--sev-*`, `--fam-*`, `--graph-*`) so
 * CSS and canvas can never drift. No hex literal may appear outside this
 * file (enforced by src/test/architecture.test.ts).
 */

export const SEVERITY_COLOR: Record<Severity, string> = {
  contraindicated: '#ff3864',
  severe: '#ff9e7a',
  moderate: '#8e97a8',
  mild: '#35d0b0',
};

/** Lighter tints for severity TEXT on dark surfaces (chips, banners): ≥ 4.5:1 (WCAG AA). */
export const SEVERITY_TEXT: Record<Severity, string> = {
  contraindicated: '#ff8fa6',
  severe: '#ffb59a',
  moderate: '#b4bccb',
  mild: '#5fe0c4',
};

export const FAMILY_COLOR: Record<Family, string> = {
  pk: '#56b4e9',
  cardiac: '#e69f00',
  cns: '#b794f4',
  'pd-other': '#8bd17c',
  clinical: '#7d8aa3',
};

export const GRAPH_COLOR = {
  /** approximates the theme's dark --background for colour blending */
  background: '#1d1c2c',
  /** regimen / hover ring on nodes */
  ring: '#ffffff',
  /** soft halo behind a hovered node */
  halo: 'rgba(255,255,255,0.07)',
  /** text on a filled severity cell */
  onSeverity: '#0b0b12',
} as const;

/** Blend a hex colour toward a background hex (t = share of the colour). */
export function mixHex(color: string, background: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [c, b] = [parse(color), parse(background)];
  return `#${c
    .map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Every token as a CSS custom property. */
export function tokenVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(SEVERITY_COLOR)) vars[`--sev-${k}`] = v;
  for (const [k, v] of Object.entries(SEVERITY_TEXT)) vars[`--sev-${k}-text`] = v;
  for (const [k, v] of Object.entries(FAMILY_COLOR)) vars[`--fam-${k}`] = v;
  vars['--graph-bg'] = GRAPH_COLOR.background;
  vars['--graph-ring'] = GRAPH_COLOR.ring;
  vars['--on-severity'] = GRAPH_COLOR.onSeverity;
  return vars;
}

/** Publish the tokens on `:root` once at startup. */
export function applyTokenVars(el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(tokenVars())) el.style.setProperty(k, v);
}
