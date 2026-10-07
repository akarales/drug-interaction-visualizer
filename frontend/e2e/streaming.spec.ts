import { expect, test } from '@playwright/test';

/** Streamed explanation on the stub model (paced fragments, no network/GPU). */
test('explanation streams in, then the validated payload enables copy/print', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();

  // streamed text arrives (the mid-stream state itself is covered by the
  // Rust stream tests and the NDJSON reader unit tests: the stub finishes in
  // about a second, too fast to assert reliably on a slow CI runner)
  await expect(inspector.getByText(/Offline stub \(clinician section\)/)).toBeVisible();

  // final payload: Stop gone, handout actions available, disclaimer shown
  await expect(inspector.getByRole('button', { name: 'Explain again' })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Copy patient handout' })).toBeVisible();
  await expect(inspector.getByText(/Not medical advice/)).toBeVisible();
});

test('Stop cancels a running explanation', async ({ page }) => {
  // hold the stream open (never respond) so Stop is deterministically available
  await page.route('**/api/v1/explain/stream', () => {});
  await page.goto('/?meds=warfarin,aspirin');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();
  await inspector.getByRole('button', { name: 'Stop' }).click();
  await expect(inspector.getByText('Stopped — the model request was cancelled.')).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Copy patient handout' })).toHaveCount(0);
});
