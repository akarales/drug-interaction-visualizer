import { describe, expect, it } from 'vitest';

import { handoutText } from './handout';

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
