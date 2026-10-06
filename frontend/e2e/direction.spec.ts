import { expect, test } from '@playwright/test';

/**
 * FDA direction on the 8-drug fixture: fluconazole (moderate CYP2C9
 * inhibitor) → warfarin (CYP2C9 substrate); warfarin + aspirin has no FDA
 * roles, so the UI must say "not established" instead of guessing.
 */
test('pair card shows the FDA direction with its source, or says it is unknown', async ({ page }) => {
  await page.goto('/?meds=warfarin,fluconazole');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('Direction', { exact: true })).toBeVisible();
  await expect(inspector.getByText('(moderate CYP2C9 inhibitor)')).toBeVisible();
  await expect(inspector.getByRole('link', { name: 'FDA CYP/transporter table' })).toHaveAttribute('href', /fda\.gov/);

  await page.goto('/?meds=warfarin,aspirin');
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByText(/^Not established/)).toBeVisible();
});

test('interaction list filters by direction relative to the focused drug', async ({ page }) => {
  await page.goto('/?meds=fluconazole');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('radio', { name: /Acts on/ }).click();
  // CYP2C9 → warfarin, CYP3A → alprazolam
  await expect(inspector.getByRole('button', { name: /Warfarin/ })).toBeVisible();
  await expect(inspector.getByRole('button', { name: /Alprazolam/ })).toBeVisible();
  // glyburide is only an OATP substrate and fluconazole inhibits no OATP → unknown, filtered out
  await expect(inspector.getByRole('button', { name: /Glyburide/ })).toHaveCount(0);
  await inspector.getByRole('radio', { name: /^All/ }).click();
  await expect(inspector.getByRole('button', { name: /Glyburide/ })).toBeVisible();
});
