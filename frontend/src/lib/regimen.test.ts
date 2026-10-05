import { describe, expect, it } from 'vitest';

import type { NeighborInfo } from '@/api/types';
import { handoutText } from '@/lib/handout';
import { regimenCsv, regimenPairs } from '@/lib/regimen';
import type { NeighborMap } from '@/state/explorer';

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

describe('regimenCsv', () => {
  it('escapes RFC 4180 fields and includes overrides', () => {
    const pairs = regimenPairs(['a', 'b', 'c'], neighbors);
    const csv = regimenCsv(pairs, (id) => id.toUpperCase(), {
      'a|c': { reason: 'Specialist, recommended', at: '2026-10-06T10:00:00.000Z' },
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'drug_a,drug_b,severity,severity_basis,consequence,mechanism,override_reason,override_at',
    );
    expect(csv).toContain('"Quoted ""text"", with commas\nand a newline"');
    expect(csv).toContain('"Specialist, recommended",2026-10-06T10:00:00.000Z');
    expect(csv).toContain('B,C,not found in dataset');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('handoutText', () => {
  it('renders a plain-text handout with the dataset severity in patient language', () => {
    const text = handoutText('Warfarin', 'Aspirin', 'severe', {
      explanation: 'May raise bleeding risk.',
      severity: 'severe',
      mechanism: 'Both thin the blood.',
      recommendation: 'Report unusual bruising.',
    });
    expect(text.split('\n')[0]).toBe('Information about your medicines: Warfarin and Aspirin');
    expect(text).toContain('How serious: Serious');
    expect(text).toContain('What to watch for\nReport unusual bruising.');
    expect(text).not.toMatch(/\n\n\n/);
  });
});
