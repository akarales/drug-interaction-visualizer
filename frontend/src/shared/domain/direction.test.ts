import { describe, expect, it } from 'vitest';

import type { PairRoles } from '@/api/schemas';

import { directionText, objectRole, precipitantRole, roleOf } from './direction';

const link = {
  precipitant: 'fluconazole',
  object: 'warfarin',
  pathway: 'CYP2C9',
  effect: 'inhibits' as const,
  strength: 'moderate',
  object_sensitivity: 'moderate-sensitive',
};
const directed: PairRoles = { pattern: 'directed', links: [link] };
const name = (id: string) => id[0].toUpperCase() + id.slice(1);

describe('direction helpers', () => {
  it('tells whether the focused drug acts or is affected', () => {
    expect(roleOf('fluconazole', directed)).toBe('acts');
    expect(roleOf('warfarin', directed)).toBe('affected');
    expect(roleOf('warfarin', { pattern: 'bidirectional', links: [link] })).toBe('both');
    expect(roleOf('warfarin', undefined)).toBeNull();
  });

  it('phrases roles the way the FDA table does', () => {
    expect(precipitantRole(link)).toBe('moderate CYP2C9 inhibitor');
    expect(objectRole(link)).toBe('moderately sensitive CYP2C9 substrate');
    expect(precipitantRole({ ...link, pathway: 'P-gp', strength: 'unspecified' })).toBe('P-gp inhibitor');
  });

  it('says "unknown" rather than guessing', () => {
    expect(directionText(undefined, name)).toMatch(/^unknown/);
    expect(directionText(directed, name)).toBe(
      'Fluconazole (moderate CYP2C9 inhibitor) → Warfarin (moderately sensitive CYP2C9 substrate; exposure may increase)',
    );
  });
});
