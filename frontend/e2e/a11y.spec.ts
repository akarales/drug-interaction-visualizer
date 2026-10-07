import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility across the app's states: axe (WCAG 2.2 A/AA rules) must
 * report no serious or critical violations, and reduced motion must stop
 * the active-card animation.
 */
// axe over the full DOM on a SwiftShader-rendered WebGL page is slow on
// shared CI runners (one run took 1.3 min for a 47 s test, then timed out
// tearing down the context) — triple the timeout for this file
test.slow();

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('canvas').analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test('empty workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Medication 1' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('regimen with matrix, palette and shortcuts', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin,fluconazole');
  await expect(page.getByRole('region', { name: 'Regimen check' })).toBeVisible();
  await page.getByRole('button', { name: 'Matrix view' }).click();
  expect(await seriousViolations(page)).toEqual([]);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('streamed explanation and save dialog', async ({ page }) => {
  await page.goto('/?meds=warfarin,aspirin');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();
  await expect(inspector.getByRole('button', { name: 'Copy patient handout' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save regimen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Save regimen' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('drawers', async ({ page }) => {
    await page.goto('/?meds=warfarin,aspirin');
    await page.getByRole('button', { name: 'Open medications' }).click();
    await expect(page.getByRole('dialog', { name: 'Medications' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open regimen check and details' }).click();
    await expect(page.getByRole('dialog', { name: 'Regimen check and details' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the active-card trace is static', async ({ page }) => {
    await page.goto('/?meds=warfarin,aspirin');
    const head = page.locator('section[aria-current="true"] .trace__head');
    await expect(head).toHaveCount(1);
    expect(await head.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await head.evaluate((el) => getComputedStyle(el).strokeDasharray)).toBe('none');
  });
});
