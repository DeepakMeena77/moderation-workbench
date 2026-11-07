import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { signInAs } from './support/auth';
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

test('[OPS-1] timestamps read as local times ("7 Nov, 19:13") and keep the ISO value in the title', async ({
  page,
}) => {
  await openStatus(page, 1280);
  const checked = page.locator('time').first();
  await expect(checked).toHaveText(/^\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
  await expect(checked).toHaveAttribute('title', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  await expect(page.getByText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)).toHaveCount(0);
});

test('[UX-3] /status has one main landmark and exactly one h1', async ({ page }) => {
  await openStatus(page, 1280);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('System status');
});

// OPS-4: the admin's job controls. Process pending may run real queued work, which is what the button is for.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`status admin panel, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [390, 1280]) {
      test(`[OPS-4] the admin sees Process pending and the failed jobs, accessible and styled at ${width}px (${scheme})`, async ({
        page,
      }) => {
        await signInAs(page, 'admin');
        await openStatus(page, width);
        const panel = page.getByRole('region', { name: 'Background jobs (admin)' });
        await expect(panel).toBeVisible();
        await expect(panel.getByRole('heading', { name: 'Failed jobs' })).toBeVisible();
        await expect(panel.locator('[aria-busy="true"]')).toHaveCount(0);
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  });
}

test('[OPS-4] Process pending reports what it did; other roles never see the panel', async ({ page }) => {
  await signInAs(page, 'moderator');
  // The panel depends on the role the page reads from /api/auth/me; check only once that answer is in.
  const roleRead = page.waitForResponse((res) => res.url().endsWith('/api/auth/me') && res.ok());
  await openStatus(page, 1280);
  await roleRead;
  await expect(page.getByRole('heading', { level: 2, name: 'Database' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Background jobs (admin)' })).toHaveCount(0);

  await signInAs(page, 'admin');
  await openStatus(page, 1280);
  await page.getByRole('button', { name: 'Process pending jobs' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /^(No jobs were waiting\.|Processed \d+ jobs?: .+\.)$/ }),
  ).toBeVisible({
    timeout: 60_000,
  });
});
