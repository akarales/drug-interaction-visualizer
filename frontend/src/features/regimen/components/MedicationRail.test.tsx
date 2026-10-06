// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TooltipProvider } from '@/components/ui/tooltip';
import { LIVE_REGION_ID } from '@/shared/announce';
import { drug, interaction, seedRegimen } from '@/test/fixtures';

vi.mock('@/api/drugs', () => ({ fetchNeighbors: vi.fn(async () => []), resolveDrug: vi.fn() }));

const { useExplorer, pickedIds } = await import('@/state');
const { MedicationRail } = await import('./MedicationRail');

const initial = useExplorer.getState();
const drugs = [drug('warfarin', 'Warfarin'), drug('aspirin', 'Aspirin'), drug('omeprazole', 'Omeprazole')];
const view = () =>
  render(
    <TooltipProvider>
      <MedicationRail />
      <p id={LIVE_REGION_ID} />
    </TooltipProvider>,
  );
const order = () => pickedIds(useExplorer.getState().slots);

beforeEach(() => {
  useExplorer.setState({ ...initial, collapsedCards: {}, floatingSlot: null }, true);
  seedRegimen(drugs, ['warfarin', 'aspirin', 'omeprazole'], {
    warfarin: [interaction('aspirin', 'severe')],
    aspirin: [interaction('warfarin', 'severe')],
    omeprazole: [],
  });
});
afterEach(cleanup);

describe('MedicationRail', () => {
  it('shows every medication as its own card, all open by default', () => {
    view();
    const cards = screen.getAllByRole('region', { name: /^Medication \d$/ });
    expect(cards).toHaveLength(3);
    for (const card of cards) expect(within(card).getByRole('textbox')).toBeTruthy();
    // the active (last) card is marked for assistive tech, not just drawn
    expect(cards[2].getAttribute('aria-current')).toBe('true');
    expect(within(cards[0]).getByText('SEV')).toBeTruthy();
  });

  it('collapses only when asked, and remembers it per drug (not per position)', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: 'Collapse medication 1' }));
    const first = screen.getByRole('region', { name: 'Medication 1' });
    expect(within(first).queryByRole('textbox')).toBeNull();
    expect(useExplorer.getState().collapsedCards).toEqual({ warfarin: true });
    // collapsing does not steal the active card
    expect(useExplorer.getState().active).toBe(2);

    act(() => useExplorer.getState().moveSlot(0, 2));
    const moved = screen.getByRole('region', { name: 'Medication 3' });
    expect(within(moved).queryByRole('textbox')).toBeNull();
    expect(within(moved).getByText('Warfarin')).toBeTruthy();
  });

  it('reorders with Alt+↑/↓ and announces the new position', async () => {
    const user = userEvent.setup();
    view();
    within(screen.getByRole('region', { name: 'Medication 1' })).getByRole('textbox').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(order()).toEqual(['aspirin', 'warfarin', 'omeprazole']);
    await vi.waitFor(() =>
      expect(document.getElementById(LIVE_REGION_ID)?.textContent).toBe('Warfarin moved to position 2 of 3'),
    );
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(order()).toEqual(['warfarin', 'aspirin', 'omeprazole']);
  });
});
