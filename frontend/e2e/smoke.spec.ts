import { expect, test } from '@playwright/test';

/**
 * The core clinician flow on the 8-drug fixture: build a regimen, see the
 * graded pair, generate the clinician + patient explanation, use the
 * command palette, and step back through history.
 */
test('regimen check end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.getByRole('banner').getByText('8 drugs · 7 interactions')).toBeVisible();

  // pick from the first column (keyboard path)
  await page.locator('[data-col-search="0"]').fill('warf');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/meds=warfarin$/);

  // add a second medication -> graded pair in the regimen panel
  await page.getByRole('button', { name: 'Add another medication' }).click();
  await page.locator('[data-col-search="1"]').fill('aspirin');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/meds=warfarin,aspirin$/);
  const regimen = page.getByRole('region', { name: 'Regimen check' });
  await expect(regimen.getByText('Warfarin + Aspirin')).toBeVisible();
  await expect(regimen.getByText('SEV', { exact: true })).toBeVisible();

  // pair card + one-call clinician/patient explanation (stub provider)
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('Seriousness')).toBeVisible();
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();
  await expect(inspector.getByRole('region', { name: 'For the clinician' })).toBeVisible();
  await expect(inspector.getByRole('region', { name: 'Patient handout' })).toBeVisible();

  // command palette adds a third drug by keyboard
  await page.locator('body').click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('ibupro');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/meds=warfarin,aspirin,ibuprofen$/);

  // history: back removes it again
  await page.goBack();
  await expect(page).toHaveURL(/meds=warfarin,aspirin$/);

  expect(errors).toEqual([]);
});

test('shared link restores the regimen', async ({ page }) => {
  await page.goto('/?meds=fluconazole,glyburide');
  await expect(page.getByRole('region', { name: 'Regimen check' })).toBeVisible();
  await expect(page.locator('section[aria-label^="Medication "]')).toHaveCount(2);
});
