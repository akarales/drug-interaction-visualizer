import { expect, test } from '@playwright/test';

/**
 * Saved regimens + override audit (the e2e API uses the in-memory store).
 * The fixture has no contraindicated pair, so overrides are covered by the
 * API and component tests; here: save, reopen, identifier screening.
 */
test('save a regimen, change it, reopen the saved one', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  await page.getByRole('button', { name: 'Save regimen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save regimen' });

  // identifier-like labels are refused by the server, with a reason
  await dialog.getByLabel('Label').fill('Jane D, DOB 03/14/1961');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('synthetic data only');

  await dialog.getByLabel('Label').fill('Anticoagulation review 3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Saved as')).toContainText('Anticoagulation review 3');

  // a different regimen, then reopen the saved one
  await page.goto('/?meds=simvastatin');
  await page.getByRole('button', { name: 'Open a saved regimen' }).click();
  const list = page.getByRole('dialog', { name: 'Saved regimens' });
  await list.getByRole('listitem').filter({ hasText: 'Anticoagulation review 3' }).getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/meds=warfarin,aspirin$/);
  await expect(page.getByText('Saved as')).toContainText('Anticoagulation review 3');
});
