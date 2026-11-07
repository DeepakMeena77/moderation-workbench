import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { auditStyles } from './support/styleAudit';

// /status joins the UI quality matrix in S0 (docs/04-build-plan.md S0, docs/05-test-plan.md sec. 6).

async function openStatus(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/status');
  // Wait for the report, not the skeleton: the database card appears whether the check passes or fails.
  await expect(page.getByRole('heading', { level: 2, name: 'Database' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] /status has no serious or critical axe violations at ${width}px (${scheme})`, async ({ page }) => {
        await openStatus(page, width);
        expect(await seriousAxeViolations(page)).toEqual([]);
      });

      test(`[UX-4] /status passes the style audit at ${width}px (${scheme})`, async ({ page }) => {
        await openStatus(page, width);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });
    }

    for (const width of [320, 1280]) {
      test(`[UX-2] /status has no horizontal scroll at ${width}px (${scheme})`, async ({ page }) => {
        await openStatus(page, width);
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  });
}

test('[UX-3] /status has one main landmark and exactly one h1', async ({ page }) => {
  await openStatus(page, 1280);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('System status');
});
