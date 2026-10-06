import { describe, expect, it } from 'vitest';

import { asSeverity, basisLabel, familyOf, mixHex, worse } from '@/shared/domain';

describe('severity helpers', () => {
  it('normalises unknown severities to moderate', () => {
    expect(asSeverity('severe')).toBe('severe');
    expect(asSeverity('nonsense')).toBe('moderate');
  });

  it('keeps the worse of two tiers', () => {
    expect(worse(null, 'mild')).toBe('mild');
    expect(worse('moderate', 'contraindicated')).toBe('contraindicated');
    expect(worse('severe', 'mild')).toBe('severe');
  });

  it('describes where a grade came from', () => {
    expect(basisLabel('onc:13')).toContain('ONC high-priority DDI #13');
    expect(basisLabel('default:activity:x')).toContain('default grade');
    expect(basisLabel('kind:activity:anticoagulant')).toContain('anticoagulant');
    expect(basisLabel(undefined)).toBe('editorial grade');
  });
});

describe('familyOf', () => {
  it('maps dominant interaction kinds to families', () => {
    expect(familyOf('metabolism')).toBe('pk');
    expect(familyOf('qtc-prolonging')).toBe('cardiac');
    expect(familyOf('activity:anticoagulant')).toBe('cardiac');
    expect(familyOf('cns-depressant')).toBe('cns');
    expect(familyOf('adverse-effects')).toBe('clinical');
    expect(familyOf('activity:photosensitizing')).toBe('pd-other');
  });
});

describe('mixHex', () => {
  it('blends towards the background', () => {
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mixHex('#ffffff', '#000000', 0)).toBe('#000000');
    expect(mixHex('#ff0000', '#000000', 0.5)).toBe('#800000');
  });
});
