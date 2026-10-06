// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { drug, interaction, seedRegimen } from '@/test/fixtures';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/api/drugs', () => ({ fetchNeighbors: vi.fn(async () => []) }));

const { useExplorer } = await import('@/state');
const { RegimenPanel } = await import('./RegimenPanel');

const initial = useExplorer.getState();
const drugs = [drug('warfarin', 'Warfarin'), drug('aspirin', 'Aspirin'), drug('omeprazole', 'Omeprazole')];
const view = () =>
  render(
    // delay 0: tooltips always open on hover, so the test can't depend on runner speed
    <TooltipProvider delayDuration={0}>
      <RegimenPanel />
    </TooltipProvider>,
  );

beforeEach(() => {
  useExplorer.setState({ ...initial, regimenView: 'list' }, true);
  seedRegimen(drugs, ['warfarin', 'aspirin', 'omeprazole'], {
    warfarin: [interaction('aspirin', 'severe', { kind: 'activity:anticoagulant' })],
    aspirin: [interaction('warfarin', 'severe', { kind: 'activity:anticoagulant' })],
    omeprazole: [],
  });
});
afterEach(cleanup);

describe('RegimenPanel', () => {
  it('renders nothing with fewer than two medications', () => {
    seedRegimen(drugs, ['warfarin'], { warfarin: [] });
    const { container } = view();
    expect(container.textContent).toBe('');
  });

  it('lists every pair worst first and never calls a missing pair safe', () => {
    view();
    const panel = screen.getByRole('region', { name: 'Regimen check' });
    expect(within(panel).getByText('3 meds · 1/3 pairs interact in this dataset')).toBeTruthy();
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Warfarin + Aspirin');
    expect(within(panel).getAllByText('not found in this dataset (not a safety claim)')).toHaveLength(2);
    expect(panel.textContent?.toLowerCase()).not.toContain('safe combination');
    expect(within(panel).getByText(/1 severe interaction — review before continuing/)).toBeTruthy();
  });

  it('switches to the matrix with text labels, not colour alone', async () => {
    const user = userEvent.setup();
    view();
    const matrix = screen.getByRole('button', { name: 'Matrix view' });
    await user.hover(matrix);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await user.click(matrix);
    expect(screen.getAllByRole('button', { name: 'Warfarin + Aspirin: severe' })).toHaveLength(1);
    expect(screen.getAllByText('SEV').length).toBeGreaterThan(0);
    expect(screen.getByText(/not found in this dataset \(not a safety claim\)/)).toBeTruthy();
  });
});
