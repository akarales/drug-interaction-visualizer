import { describe, expect, it } from 'vitest';

import { gapAt, targetIndex } from './useReorder';

describe('reorder geometry', () => {
  const mids = [50, 150, 250]; // three cards

  it('maps the pointer to the gap between cards', () => {
    expect(gapAt(10, mids)).toBe(0);
    expect(gapAt(120, mids)).toBe(1);
    expect(gapAt(260, mids)).toBe(3);
  });

  it('converts a gap into the final index (removing the dragged item first)', () => {
    expect(targetIndex(0, 3)).toBe(2); // first → last
    expect(targetIndex(2, 0)).toBe(0); // last → first
    expect(targetIndex(1, 1)).toBe(1); // dropped on itself
    expect(targetIndex(1, 2)).toBe(1); // just below itself = no move
  });
});
