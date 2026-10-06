import { describe, expect, it } from 'vitest';

import type { NeighborInfo } from '@/api/schemas';
import type { NeighborMap } from '@/state';

import { regimenCsv } from './csv';
import { regimenPairs, regimenRisk, worstRegimenPair } from './pairs';

const n = (id: string, severity: string, mechanism = `${id} text`): NeighborInfo => ({
  id,
  name: id,
  category: 'metabolism',
  kind: 'metabolism',
  direction: 'increase',
  severity,
  severity_basis: 'kind:metabolism',
  mechanism,
});

// a interacts with b (moderate) and c (contraindicated); b–c not in dataset
const neighbors: Record<string, NeighborMap> = {
  a: new Map([
    ['b', n('b', 'moderate')],
    ['c', n('c', 'contraindicated', 'Quoted "text", with commas\nand a newline')],
  ]),
  b: new Map([['a', n('a', 'moderate')]]),
  c: new Map(),
};

describe('regimenPairs', () => {
  it('lists every unordered pair, worst first, absent pairs last', () => {
    const pairs = regimenPairs(['a', 'b', 'c'], neighbors);
    expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(['a-c', 'a-b', 'b-c']);
    expect(pairs[0].severity).toBe('contraindicated');
    expect(pairs[2]).toMatchObject({ loaded: true, info: null, severity: null });
  });

  it('reads the pair from whichever side is loaded', () => {
    const pairs = regimenPairs(['b', 'a'], { b: neighbors.b });
    expect(pairs[0].severity).toBe('moderate');
  });
});

describe('worstRegimenPair', () => {
  it('picks the most severe pair, or the first pair when none interact', () => {
    expect(worstRegimenPair(['b', 'a', 'c'], neighbors)).toEqual(['a', 'c']);
    expect(worstRegimenPair(['b', 'c'], neighbors)).toEqual(['b', 'c']);
    expect(worstRegimenPair(['a'], neighbors)).toBeNull();
  });
});

describe('regimenRisk', () => {
  it('keeps the worst tier and counts how many regimen drugs interact', () => {
    const risk = regimenRisk(['b', 'c', 'a'], neighbors);
    expect(risk.get('a')).toEqual({ worst: 'moderate', count: 1 });
    expect(risk.get('c')).toEqual({ worst: 'contraindicated', count: 1 });
    expect(risk.has('z')).toBe(false);
  });

  it('ignores drugs whose interaction list is not loaded yet', () => {
    expect(regimenRisk(['x'], neighbors).size).toBe(0);
  });
});

describe('regimenCsv', () => {
  it('escapes RFC 4180 fields and includes overrides', () => {
    const pairs = regimenPairs(['a', 'b', 'c'], neighbors);
    const csv = regimenCsv(pairs, (id) => id.toUpperCase(), {
      'a|c': { reason: 'Specialist, recommended', at: '2026-10-06T10:00:00.000Z' },
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'drug_a,drug_b,severity,severity_basis,consequence,mechanism,override_reason,override_at,direction_fda',
    );
    expect(csv).toContain('"Quoted ""text"", with commas\nand a newline"');
    expect(csv).toContain('"Specialist, recommended",2026-10-06T10:00:00.000Z,unknown');
    expect(csv).toContain('B,C,not found in dataset');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
