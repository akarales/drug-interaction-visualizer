import { beforeEach, describe, expect, it, vi } from 'vitest';

import { drug } from '@/test/fixtures';

const api = vi.hoisted(() => ({
  appendOverride: vi.fn(async () => ({})),
  createRegimen: vi.fn(async (label: string, drug_ids: string[]) => ({ id: 'r1', label, drug_ids })),
  updateRegimen: vi.fn(async (id: string, label: string, drug_ids: string[]) => ({ id, label, drug_ids })),
  getRegimen: vi.fn(),
  errorMessage: String,
}));
vi.mock('@/api/regimens', () => api);
vi.mock('@/api/drugs', () => ({ fetchNeighbors: vi.fn(async () => []) }));

const { useExplorer, pickedIds } = await import('@/state');
const initial = useExplorer.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useExplorer.setState(initial, true);
  const drugs = ['clarithromycin', 'simvastatin', 'warfarin'].map((id) => drug(id));
  useExplorer.getState().setDataset(drugs, { drugs: 3, interactions: 2, severity_mix: {} });
  useExplorer.getState().setRegimen(['clarithromycin', 'simvastatin']);
});

describe('saved regimens', () => {
  it('saving a new regimen carries the overrides decided on its drugs', async () => {
    const s = useExplorer.getState();
    s.recordOverride('clarithromycin', 'simvastatin', 'Short course');
    s.overridePair('warfarin', 'aspirin', 'not in this regimen');
    await s.saveRegimen('Statin review');
    expect(api.createRegimen).toHaveBeenCalledWith('Statin review', ['clarithromycin', 'simvastatin'], [
      { drug_a: 'clarithromycin', drug_b: 'simvastatin', reason: 'Short course' },
    ]);
    expect(useExplorer.getState().savedRegimen).toEqual({ id: 'r1', label: 'Statin review', currentDataset: true });

    // saving again updates the open regimen and later overrides reference it
    await useExplorer.getState().saveRegimen('Statin review v2');
    expect(api.updateRegimen).toHaveBeenCalledWith('r1', 'Statin review v2', ['clarithromycin', 'simvastatin']);
    useExplorer.getState().recordOverride('clarithromycin', 'simvastatin', 'Re-confirmed');
    expect(api.appendOverride).toHaveBeenLastCalledWith(expect.objectContaining({ regimen_id: 'r1' }));
  });

  it('opening restores the drugs and only the overrides still in force', async () => {
    api.getRegimen.mockResolvedValue({
      regimen: { id: 'r9', label: 'Opened', drug_ids: ['warfarin', 'clarithromycin', 'simvastatin'] },
      audit: [],
      active_overrides: [
        { drug_a: 'clarithromycin', drug_b: 'simvastatin', reason: 'Specialist advice', created_at: '2026-10-06T10:00:00Z' },
      ],
      current_dataset: false,
    });
    await useExplorer.getState().openRegimen('r9');
    const s = useExplorer.getState();
    expect(pickedIds(s.slots)).toEqual(['warfarin', 'clarithromycin', 'simvastatin']);
    expect(s.overrides).toEqual({ 'clarithromycin|simvastatin': { reason: 'Specialist advice', at: '2026-10-06T10:00:00Z' } });
    expect(s.savedRegimen).toEqual({ id: 'r9', label: 'Opened', currentDataset: false });
  });

  it('revoking removes the override locally after the event is appended', async () => {
    const s = useExplorer.getState();
    s.overridePair('clarithromycin', 'simvastatin', 'Short course');
    await s.revokeOverride('clarithromycin', 'simvastatin', 'Course finished');
    expect(api.appendOverride).toHaveBeenCalledWith(expect.objectContaining({ action: 'revoke', reason: 'Course finished' }));
    expect(useExplorer.getState().overrides).toEqual({});
  });
});
