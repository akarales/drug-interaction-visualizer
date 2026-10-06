import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The V4 workspace on the 8-drug fixture: content-height cards the user
 * collapses (remembered), keyboard reorder, pop-out/dock, F6 regions, and
 * an accessibility scan of the whole workspace.
 */
test.use({ viewport: { width: 1440, height: 900 } });

test('cards collapse on request, reorder by keyboard, pop out and dock', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin,fluconazole');
  const card = (n: number) => page.getByRole('region', { name: `Medication ${n}`, exact: true });
  await expect(card(3)).toBeVisible();

  // several cards open at once (content height), none collapsed automatically
  for (const n of [1, 2, 3]) await expect(card(n).locator('input')).toBeVisible();

  // collapse is remembered across a reload
  await page.getByRole('button', { name: 'Collapse medication 1' }).click();
  await expect(card(1).locator('input')).toHaveCount(0);
  await page.reload();
  await expect(card(1).getByText('Warfarin')).toBeVisible();
  await expect(card(1).locator('input')).toHaveCount(0);

  // Alt+↓ moves the focused card; the URL keeps the regimen order
  await card(2).locator('input').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page).toHaveURL(/meds=warfarin,fluconazole,aspirin$/);

  // drag the first card's grip below the last card
  const grip = page.getByRole('button', { name: /^Reorder medication 1/ });
  const box = await grip.boundingBox();
  const last = await card(3).boundingBox();
  if (!box || !last) throw new Error('layout not measured');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, last.y + last.height - 4, { steps: 8 });
  await page.mouse.up();
  await expect(page).toHaveURL(/meds=fluconazole,aspirin,warfarin$/);

  // pop out → floating window + stub in the rail; dock back
  await page.getByRole('button', { name: 'Pop out medication 2' }).click();
  const floating = page.getByRole('dialog', { name: 'Floating medication 2' });
  await expect(floating).toBeVisible();
  await expect(page.getByText('Aspirin — floating')).toBeVisible();
  await floating.getByRole('button', { name: 'Dock medication 2 back into the list' }).click();
  await expect(floating).toHaveCount(0);

  // F6 cycles rail → map → right column
  await page.locator('body').click({ position: { x: 700, y: 20 } });
  await page.keyboard.press('F6');
  await expect(page.locator('[data-region="rail"]')).toBeFocused();
  await page.keyboard.press('F6');
  await expect(page.locator('[data-region="map"]')).toBeFocused();
  await page.keyboard.press('F6');
  await expect(page.locator('[data-region="right"]')).toBeFocused();
});

test('workspace has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  await expect(page.getByRole('region', { name: 'Regimen check' })).toBeVisible();
  const results = await new AxeBuilder({ page }).exclude('canvas').analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(serious).toEqual([]);
});
