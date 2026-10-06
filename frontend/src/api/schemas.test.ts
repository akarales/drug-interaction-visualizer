import { describe, expect, it } from 'vitest';

import { DrugsResponseSchema, ExplanationResponseSchema, NeighborsResponseSchema } from './schemas';

describe('response schemas', () => {
  it('accept the API shapes (optional fields omitted, nullable dataset severity)', () => {
    expect(
      DrugsResponseSchema.safeParse({
        drugs: [{ id: 'warfarin', name: 'Warfarin', category: 'metabolism', degree: 3, severity_mix: [0, 1, 2, 0], aliases: [] }],
        stats: { drugs: 1, interactions: 3, severity_mix: { severe: 1 } },
      }).success,
    ).toBe(true);
    const section = { explanation: 'e', severity: 'severe', mechanism: 'm', recommendation: 'r' };
    expect(
      ExplanationResponseSchema.safeParse({
        drug_a: 'a',
        drug_b: 'b',
        direct_interaction: false,
        chain_length: 0,
        dataset_severity: null,
        severity_basis: null,
        payload: section,
        sections: { clinician: section, patient: section },
        provider: 'stub',
        model: 'stub',
        audience: 'both',
        stub: true,
        disclaimer: 'd',
      }).success,
    ).toBe(true);
  });

  it('reject drift instead of leaking undefined into the UI', () => {
    expect(NeighborsResponseSchema.safeParse({ drug: 'a', neighbors: [{ id: 'b', name: 'B' }] }).success).toBe(false);
    expect(DrugsResponseSchema.safeParse({ drugs: [], stats: { drugs: '1' } }).success).toBe(false);
  });
});
