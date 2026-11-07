import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs } from './support/auth';
import { auditStyles } from './support/styleAudit';

// The Audit page (docs/03-ui-ux.md sec. 6.10; AUD-3, AUD-5, UX-2..4). Needs the seeded database. Each test first
// makes sure there is at least one event: an author asking for the metrics gets 403, which is recorded as
// access.denied (AUD-4). That is the only change these tests make to the database.

async function ensureAnEvent(page: Page): Promise<void> {
  await signInAs(page, 'author');
  expect((await page.request.get('/api/metrics')).status()).toBe(403);
}

async function openAudit(page: Page, width: number): Promise<void> {
  await ensureAnEvent(page);
  await signInAs(page, 'moderator');
  await openPage(page, '/audit', width);
  await expect(page.getByText(/^Audit chain intact, [\d,]+ events? verified\.$/)).toBeVisible();
  await expect(page.getByText(/^Showing \d+ of \d+$/)).toBeVisible();
}

/** The expand button of the newest event, in whichever layout (table or list) is showing. */
const firstExpand = (page: Page) => page.getByRole('button', { name: /^Details of event #\d+$/ }).first();

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`audit, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] the audit page and an expanded event are accessible and pass the style audit at ${width}px (${scheme})`, async ({
        page,
      }) => {
        await openAudit(page, width);
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);

        await firstExpand(page).click();
        await expect(firstExpand(page)).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('heading', { name: 'After', exact: true }).first()).toBeVisible();
        // The click leaves the button hovered and focused, so its tooltip is open and audited too.
        await expect(page.getByRole('tooltip')).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });
    }

    for (const width of [320, 840, 1920]) {
      test(`[UX-2] the audit page has no horizontal scroll at ${width}px (${scheme})`, async ({ page }) => {
        await openAudit(page, width);
        await firstExpand(page).click();
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  });
}

test('[AUD-5] a table from 840 px and a list below it', async ({ page }) => {
  await openAudit(page, 1280);
  await expect(page.getByRole('table', { name: 'Audit events, newest first' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByRole('list', { name: 'Audit events, newest first' })).toBeVisible();
});

test('[AUD-5] filters live in the URL and can be cleared', async ({ page }) => {
  await openAudit(page, 1280);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  await expect(page).toHaveURL(/actorType=human/);
  await page.getByRole('searchbox', { name: 'Search the audit trail' }).fill('access.denied');
  await expect(page).toHaveURL(/q=access\.denied/);
  // The action shows in words; its code stays in the tooltip and still matches the search.
  await expect(page.getByRole('cell', { name: 'Access denied' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page).toHaveURL(/\/audit$/);
});
