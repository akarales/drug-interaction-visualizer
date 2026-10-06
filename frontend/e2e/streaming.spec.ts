import { expect, test } from '@playwright/test';

/** Streamed explanation on the stub model (paced fragments, no network/GPU). */
test('explanation streams in, then the validated payload enables copy/print', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();

  // while streaming: Stop is offered and text is already visible
  await expect(inspector.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(inspector.getByText(/Offline stub \(clinician section\)/)).toBeVisible();

  // final payload: Stop gone, handout actions available, disclaimer shown
  await expect(inspector.getByRole('button', { name: 'Explain again' })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Copy patient handout' })).toBeVisible();
  await expect(inspector.getByText(/Not medical advice/)).toBeVisible();
});

test('Stop cancels a running explanation', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();
  await inspector.getByRole('button', { name: 'Stop' }).click();
  await expect(inspector.getByText('Stopped — the model request was cancelled.')).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Copy patient handout' })).toHaveCount(0);
});
