// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { drug, interaction, seedRegimen } from '@/test/fixtures';

vi.mock('@/api/drugs', () => ({ fetchNeighbors: vi.fn(async () => []) }));
const { appendOverride } = vi.hoisted(() => ({ appendOverride: vi.fn(async () => ({})) }));
vi.mock('@/api/regimens', () => ({ appendOverride, errorMessage: String }));

const { useExplorer, pairKey } = await import('@/state');
const { ContraindicationAlert } = await import('./ContraindicationAlert');

const initial = useExplorer.getState();
const drugs = [drug('clarithromycin', 'Clarithromycin'), drug('simvastatin', 'Simvastatin')];

beforeEach(() => {
  useExplorer.setState(initial, true);
  seedRegimen(drugs, ['clarithromycin', 'simvastatin'], {
    clarithromycin: [interaction('simvastatin', 'contraindicated')],
  });
});
afterEach(cleanup);

describe('ContraindicationAlert', () => {
  it('interrupts with the seven DDI elements and the newer drug as the removable one', () => {
    render(<ContraindicationAlert />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Contraindicated combination')).toBeTruthy();
    for (const label of ['Seriousness', 'Consequence', 'Mechanism', 'Modifying factors', 'Recommended action', 'Evidence'])
      expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(/ONC high-priority DDI #11/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Simvastatin' })).toBeTruthy();
  });

  it('requires a documented reason before the pair can be kept', async () => {
    const user = userEvent.setup();
    render(<ContraindicationAlert />);
    const keep = screen.getByRole('button', { name: 'Override & keep both' });
    expect((keep as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'Other' }));
    expect((keep as HTMLButtonElement).disabled).toBe(true); // "Other" needs text
    await user.type(screen.getByRole('textbox', { name: 'Other override reason' }), 'Palliative care');
    expect((keep as HTMLButtonElement).disabled).toBe(false);

    await user.click(keep);
    expect(useExplorer.getState().overrides[pairKey('clarithromycin', 'simvastatin')]?.reason).toBe('Palliative care');
    // …and the decision is appended to the server-side audit trail
    expect(appendOverride).toHaveBeenCalledWith({
      drug_a: 'clarithromycin',
      drug_b: 'simvastatin',
      reason: 'Palliative care',
      regimen_id: null,
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does not close on Escape — a decision is required', async () => {
    const user = userEvent.setup();
    render(<ContraindicationAlert />);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('removing the newer drug clears the alert and keeps the older one', async () => {
    const user = userEvent.setup();
    render(<ContraindicationAlert />);
    await user.click(screen.getByRole('button', { name: 'Remove Simvastatin' }));
    expect(useExplorer.getState().slots.map((s) => s.drug)).toEqual(['clarithromycin']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('stays silent for severe (non-contraindicated) pairs', () => {
    seedRegimen(drugs, ['clarithromycin', 'simvastatin'], {
      clarithromycin: [interaction('simvastatin', 'severe')],
    });
    render(<ContraindicationAlert />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
