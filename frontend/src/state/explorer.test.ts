import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrugSummary, NeighborInfo } from '@/api/types';

// no network in unit tests: interaction lists come from this fake
vi.mock('@/api/client', () => ({
  fetchNeighbors: vi.fn(async (id: string): Promise<NeighborInfo[]> =>
    id === 'warfarin'
      ? [
          {
            id: 'aspirin',
            name: 'Aspirin',
            category: 'activity:antiplatelet',
            kind: 'activity:anticoagulant',
            direction: 'increase',
            severity: 'severe',
            mechanism: 'Warfarin may increase the anticoagulant activities of Aspirin.',
          },
        ]
      : [],
  ),
}));

const { pairInfo, pickedIds, useExplorer } = await import('@/state/explorer');

const drug = (id: string): DrugSummary => ({ id, name: id, category: 'metabolism', degree: 1 });
const initial = useExplorer.getState();

beforeEach(() => {
  useExplorer.setState(initial, true);
  useExplorer.getState().setDataset([drug('warfarin'), drug('aspirin'), drug('simvastatin')], {
    drugs: 3,
    interactions: 1,
    severity_mix: {},
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const picks = () => pickedIds(useExplorer.getState().slots);

describe('regimen columns', () => {
  it('picks into a column and loads that drug’s interactions', async () => {
    useExplorer.getState().pick(0, 'warfarin');
    expect(picks()).toEqual(['warfarin']);
    await flush();
    const { info } = pairInfo(useExplorer.getState().neighbors, 'aspirin', 'warfarin');
    expect(info?.severity).toBe('severe');
  });

  it('reuses a trailing empty column instead of stacking empties', () => {
    const s = useExplorer.getState();
    s.addSlot();
    s.addSlot();
    expect(useExplorer.getState().slots).toHaveLength(1);
  });

  it('removing a column keeps the active index on the same column', () => {
    const s = useExplorer.getState();
    s.setRegimen(['warfarin', 'aspirin', 'simvastatin']);
    s.setActive(2);
    s.removeSlot(0);
    expect(picks()).toEqual(['aspirin', 'simvastatin']);
    expect(useExplorer.getState().active).toBe(1);
  });

  it('restores a regimen from ids, dropping unknown ones', () => {
    useExplorer.getState().setRegimen(['warfarin', 'not-a-drug', 'aspirin']);
    expect(picks()).toEqual(['warfarin', 'aspirin']);
  });

  it('addToRegimen fills the empty active column and never duplicates', () => {
    const s = useExplorer.getState();
    s.addToRegimen('warfarin');
    s.addToRegimen('aspirin');
    s.addToRegimen('warfarin');
    expect(picks()).toEqual(['warfarin', 'aspirin']);
  });
});

describe('escape ladder', () => {
  it('clears hover, then family focus, then the severity filter, then the active pick', () => {
    const s = useExplorer.getState();
    s.pick(0, 'warfarin');
    s.toggleFamily('pk');
    s.setSeverityFilter('severe');
    s.setHover('aspirin', 'list');

    s.escape();
    expect(useExplorer.getState().hover).toBeNull();
    s.escape();
    expect(useExplorer.getState().familyFocus).toBeNull();
    s.escape();
    expect(useExplorer.getState().severityFilter).toBeNull();
    s.escape();
    expect(picks()).toEqual([]);
  });
});

describe('overrides', () => {
  it('records a reason under an order-independent pair key', () => {
    useExplorer.getState().overridePair('warfarin', 'aspirin', 'Specialist recommendation');
    expect(useExplorer.getState().overrides['aspirin|warfarin']?.reason).toBe('Specialist recommendation');
  });
});
