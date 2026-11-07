import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs } from './support/auth';
import { auditStyles } from './support/styleAudit';

// The Metrics page (docs/03-ui-ux.md sec. 6.11; OPS-6, UX-2..4). Needs the seeded database; it only reads.

async function openMetrics(page: Page, width: number): Promise<void> {
  await signInAs(page, 'moderator');
  await openPage(page, '/metrics', width);
  await expect(page.getByRole('region', { name: 'AI and human agreement' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`metrics, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] the metrics page is accessible and passes the style audit at ${width}px (${scheme})`, async ({
        page,
      }) => {
        await openMetrics(page, width);
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });
    }

    for (const width of [320, 1920]) {
      test(`[UX-2] the metrics page has no horizontal scroll at ${width}px (${scheme})`, async ({ page }) => {
        await openMetrics(page, width);
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  });
}

test('[OPS-6] stat cards and the three bar lists are shown', async ({ page }) => {
  await openMetrics(page, 1280);
  for (const name of [
    'AI and human agreement',
    'Overrides',
    'AI failure rate',
    'Auto-cleared, then revisited',
    'Median latency (p50)',
    'Tokens (24 h)',
    'Cost (24 h)',
    'Override reasons',
    'AI failures by reason',
    'Cost by day (UTC)',
  ]) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }
  // Seven days, always, zeros included.
  await expect(page.getByRole('region', { name: 'Cost by day (UTC)' }).getByRole('listitem')).toHaveCount(7);
});
