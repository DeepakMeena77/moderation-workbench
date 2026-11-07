import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs } from './support/auth';
import { auditStyles } from './support/styleAudit';

// The Policy page (docs/03-ui-ux.md sec. 6.9; POL-2, POL-5, UX-1..4). Needs the seeded database (an active policy).
// The publish flow is driven up to the confirm dialog and cancelled: these tests never publish, so they do not
// change the database they run against.

/** The active clauses plus one new clause with a unique code, so the preview always has a diff to show. */
async function pasteableChange(page: Page): Promise<string> {
  const list = await page.request.get('/api/policies');
  expect(list.status()).toBe(200);
  const { data } = (await list.json()) as { data: { versions: Array<{ version: number; status: string }> } };
  const active = data.versions.find((v) => v.status === 'active');
  expect(active, 'an active policy is seeded').toBeTruthy();
  const res = await page.request.get(`/api/policies/${active?.version}`);
  const detail = (await res.json()) as { data: { clauses: unknown[] } };
  const code = `UI-${Date.now() % 1000}`;
  return JSON.stringify(
    {
      notes: 'UI suite preview only - never published',
      clauses: [
        ...detail.data.clauses,
        {
          code,
          title: 'UI suite clause',
          text: 'A clause used only to preview a diff in the UI quality suite.',
          defaultSeverity: 'low',
          defaultAction: 'label',
          allowedActions: ['label'],
        },
      ],
    },
    null,
    2,
  );
}

async function openReview(page: Page, width: number): Promise<void> {
  await signInAs(page, 'admin');
  await openPage(page, '/policy', width);
  await page.getByLabel('Policy JSON', { exact: true }).fill(await pasteableChange(page));
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByRole('region', { name: 'Review changes' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`policy, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] the policy page has no serious axe violations and passes the style audit at ${width}px (${scheme})`, async ({
        page,
      }) => {
        await signInAs(page, 'admin');
        await openPage(page, '/policy', width);
        await expect(page.getByRole('heading', { name: 'Versions', exact: true })).toBeVisible();
        await expect(page.getByRole('list', { name: /^Clauses of v\d+$/ })).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });

      test(`[POL-2] the publish review step and the confirm dialog are accessible and styled at ${width}px (${scheme})`, async ({
        page,
      }) => {
        await openReview(page, width);
        await expect(page.getByText(/unresolved cases? will be re-analysed under v\d+/)).toBeVisible();
        await expect(page.getByRole('region', { name: 'Added' })).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);

        await page.getByRole('button', { name: /^Publish v\d+$/ }).click();
        const dialog = page.getByRole('dialog', { name: /^Publish policy v\d+\?$/ });
        await expect(dialog).toBeVisible();
        // Audit only once the fade-in has finished: half-transparent buttons fail contrast mid-transition.
        await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
      });
    }
  });
}

test('[POL-2] invalid JSON shows the error with its path and keeps the pasted text', async ({ page }) => {
  await signInAs(page, 'admin');
  await openPage(page, '/policy', 1280);
  const field = page.getByLabel('Policy JSON', { exact: true });
  await field.fill('{"clauses": [{"code": "bad"}]}');
  await page.getByRole('button', { name: 'Validate' }).click();
  const errors = page.getByRole('list', { name: 'Validation errors' });
  await expect(errors).toBeVisible();
  await expect(errors.getByText('clauses.0.code')).toBeVisible();
  await expect(field).toHaveValue('{"clauses": [{"code": "bad"}]}');
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await auditStyles(page, 'light')).toEqual([]);
});

test('[POL-5] versions can be compared when there are at least two', async ({ page }) => {
  await signInAs(page, 'moderator');
  await openPage(page, '/policy', 1280);
  const compare = page.getByRole('region', { name: 'Compare versions' });
  await expect(compare).toBeVisible();
  // A freshly seeded database has only v1: the card then explains that compare needs a second version.
  await expect(
    compare.getByText(/clause differences|added, \d+ removed|only one version so far/).first(),
  ).toBeVisible();
  // Staff read the policy but only admins publish.
  await expect(page.getByLabel('Policy JSON', { exact: true })).toHaveCount(0);
});

test('[UX-2] the policy page and the publish review have no horizontal scroll from 320 to 1920 px', async ({
  page,
}) => {
  await openReview(page, 1280);
  for (const width of [320, 360, 390, 600, 840, 1200, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
  }
});
