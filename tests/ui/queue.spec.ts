import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs } from './support/auth';
import { auditStyles } from './support/styleAudit';
import { uniqueWords } from './support/unique';

// The Queue and Case pages (docs/03-ui-ux.md sec. 5.1, 6.5, 6.6; Q-1, Q-3, HUM-2..7, UX-1..4). Needs the seeded
// database (demo users, policy v1). Each run reuses one awaiting case made by author2, or creates it.

// In order, in one worker: the tests share one fixture case, and parallel workers would each post a copy of it
// and could run into the posting limit (SEC-4).
test.describe.configure({ mode: 'default' });

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE_URL).origin;
const FIXTURE_BODY = `UI suite case from Ben: you are a worthless idiot. Long word check: ${'b'.repeat(90)}`;

interface CaseRow {
  id: string;
  status: string;
  content: { excerpt: string };
}

async function findCase(page: Page, text: string): Promise<CaseRow | undefined> {
  const res = await page.request.get(`/api/cases?q=${encodeURIComponent(text.slice(0, 40))}&limit=50`);
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { items: CaseRow[] } };
  return data.items.find((row) => text.startsWith(row.content.excerpt.slice(0, 40)));
}

/** An awaiting_review case for FIXTURE_BODY (or `body`), created by `account` if none is open. Returns its id. */
async function ensureCase(page: Page, body = FIXTURE_BODY, account: 'author' | 'author2' = 'author2'): Promise<string> {
  await signInAs(page, 'moderator');
  const existing = body === FIXTURE_BODY ? await findCase(page, body) : undefined;
  if (existing) return existing.id;
  await signInAs(page, account);
  const res = await page.request.post('/api/posts', { data: { body }, headers: { origin: ORIGIN } });
  expect(res.status(), await res.text()).toBe(200);
  await signInAs(page, 'moderator');
  // The analysis runs in after() on the post request; the list endpoint also kicks the runner.
  let found: CaseRow | undefined;
  await expect
    .poll(
      async () => {
        found = await findCase(page, body);
        return found?.id ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  return found?.id ?? '';
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`queue and case, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] the queue and the case have no serious axe violations at ${width}px (${scheme})`, async ({
        page,
      }) => {
        const caseId = await ensureCase(page);
        await openPage(page, '/queue', width);
        await expect(page.getByRole('link', { name: /UI suite case from Ben/ }).first()).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
        await openPage(page, `/queue/${caseId}`, width);
        await expect(page.getByRole('heading', { name: 'Recommendation' })).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
      });

      test(`[UX-4] the queue and the case pass the style audit at ${width}px (${scheme})`, async ({ page }) => {
        const caseId = await ensureCase(page);
        await openPage(page, '/queue', width);
        await expect(page.getByRole('link', { name: /UI suite case from Ben/ }).first()).toBeVisible();
        expect(await auditStyles(page, scheme)).toEqual([]);
        await openPage(page, `/queue/${caseId}`, width);
        await expect(page.getByRole('heading', { name: 'Recommendation' })).toBeVisible();
        await page.getByRole('radio', { name: 'Modify' }).click();
        await expect(page.getByRole('button', { name: /^Modify: / })).toBeVisible();
        expect(await auditStyles(page, scheme)).toEqual([]);
      });
    }
  });
}

test('[UX-2] list-detail: one pane below 840 px, list and case side by side from 840 to 1199 px', async ({ page }) => {
  const caseId = await ensureCase(page);
  const cases = page.getByRole('region', { name: 'Cases', exact: true });
  const detail = page.getByRole('region', { name: 'Case', exact: true });

  await openPage(page, `/queue/${caseId}`, 600);
  await expect(detail).toBeVisible();
  await expect(cases).toBeHidden();
  await expect(page.getByRole('link', { name: 'Back to queue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Full moderation history' })).toBeVisible();

  await page.setViewportSize({ width: 840, height: 900 });
  await expect(cases).toBeVisible();
  await expect(detail).toBeVisible();
  const [list, pane] = [await cases.boundingBox(), await detail.boundingBox()];
  expect((list?.x ?? 0) + (list?.width ?? 0)).toBeLessThanOrEqual(pane?.x ?? 0);
  await expect(page.getByRole('link', { name: /UI suite case from Ben/ }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );

  // From 1200 px the case is the whole page; the queue is one link away.
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(cases).toBeHidden();
  await expect(detail).toBeVisible();

  await openPage(page, '/queue', 360);
  await expect(cases).toBeVisible();
  await expect(detail).toBeHidden();
});

test('[UX-2] the queue is a table at 1366 px and a list at 390 px; Enter on a row opens the case', async ({ page }) => {
  const caseId = await ensureCase(page);
  await openPage(page, '/queue', 1366);
  const table = page.getByRole('table', { name: 'Cases, highest priority first' });
  const list = page.getByRole('list', { name: 'Cases' });
  await expect(table).toBeVisible();
  await expect(list).toBeHidden();
  await expect(page.getByRole('region', { name: 'Case', exact: true })).toBeHidden();
  await expect(table.getByRole('columnheader')).toHaveText([
    'Priority',
    'Content',
    'Source',
    'Proposed action',
    'Severity',
    'Confidence',
    'Why a human',
    'Policy',
    'Age',
  ]);
  // Header words never break inside: "Confidence" is one line of text at this width.
  const confidenceLines = await table.getByRole('columnheader', { name: 'Confidence' }).evaluate((th) => {
    const range = document.createRange();
    range.selectNodeContents(th);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
  expect(confidenceLines).toBe(1);
  const row = table.getByRole('row').filter({ hasText: 'UI suite case from Ben' }).first();
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/queue/${caseId}$`));
  await expect(page.getByRole('heading', { level: 1, name: /^Post by/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back to queue' }).click();
  await expect(page).toHaveURL(/\/queue$/);
  await expect(table).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(table).toBeHidden();
  await expect(list).toBeVisible();
  await expect(page.getByRole('link', { name: /UI suite case from Ben/ }).first()).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);
});

test('[UX-2] the case gets a sticky supporting pane once the detail pane is wide enough', async ({ page }) => {
  const caseId = await ensureCase(page);
  await openPage(page, `/queue/${caseId}`, 1920);
  const content = await page.getByRole('region', { name: /^Post by/ }).boundingBox();
  const recommendation = await page.getByRole('region', { name: 'Recommendation' }).boundingBox();
  expect(recommendation?.x ?? 0).toBeGreaterThan((content?.x ?? 0) + (content?.width ?? 0) - 1);

  // At 1000 px the case sits beside the list, so its pane is too narrow for a second column.
  await page.setViewportSize({ width: 1000, height: 900 });
  const narrowContent = await page.getByRole('region', { name: /^Post by/ }).boundingBox();
  const narrowRecommendation = await page.getByRole('region', { name: 'Recommendation' }).boundingBox();
  expect(narrowRecommendation?.y ?? 0).toBeGreaterThan(narrowContent?.y ?? 0);
});

test('[UX-2] the case page with long content has no horizontal scroll from 320 to 1920 px', async ({ page }) => {
  const caseId = await ensureCase(page);
  await openPage(page, `/queue/${caseId}`, 1280);
  for (const width of [320, 360, 390, 600, 840, 1200, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
  }
  await openPage(page, '/queue', 320);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('[Q-1] filters and search live in the URL and survive a reload', async ({ page }) => {
  await ensureCase(page);
  await openPage(page, '/queue', 1280);
  await page.getByRole('button', { name: 'Reported' }).click();
  await expect(page).toHaveURL(/\/queue\?trigger=report$/);
  await page.getByRole('button', { name: 'Reported' }).click();
  await page.getByLabel('Search cases').fill('har-1');
  await expect(page).toHaveURL(/\/queue\?q=har-1$/);
  await page.reload();
  await expect(page.getByLabel('Search cases')).toHaveValue('har-1');
  await expect(page.getByRole('link', { name: /UI suite case from Ben/ }).first()).toBeVisible();
  await page.getByLabel('Search cases').fill('no-such-text-anywhere');
  await expect(page.getByText("No cases match 'no-such-text-anywhere'.")).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/queue$/);
});

test('[HUM-7] an admin opens the case read-only, with no decision controls', async ({ page }) => {
  const caseId = await ensureCase(page);
  await signInAs(page, 'admin');
  await openPage(page, `/queue/${caseId}`, 1280);
  await expect(page.getByText('Read-only oversight')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Decision' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Re-analyse' })).toHaveCount(0);
});

test('[HUM-3] a moderator rejects a recommendation: inline validation, then success, at 360 px', async ({ page }) => {
  // The marker makes the mock AI fail, so this case also shows the "AI unavailable" state next to the rule evidence.
  const body = `UI journey ${uniqueWords()}: you are a worthless idiot [mock:invalid]`;
  const caseId = await ensureCase(page, body, 'author');
  await openPage(page, `/queue/${caseId}`, 360);
  await expect(page.getByText(/AI review pending or unavailable/).first()).toBeVisible();
  await expect(page.getByLabel(/^Evidence for HAR-1/).first()).toBeVisible();

  const form = page.getByRole('form', { name: 'Decide on the recommendation' });
  await form.getByRole('radio', { name: 'Reject' }).click();
  await form.getByRole('button', { name: 'Reject: keep visible' }).click();
  await expect(form.getByText('Choose a reason.')).toBeVisible();
  await expect(form.getByRole('radio', { name: 'False positive' })).toBeFocused();
  expect(await seriousAxeViolations(page)).toEqual([]);

  await form.getByRole('radio', { name: 'False positive' }).click();
  await form.getByLabel(/Note/).fill('Friendly banter between two regulars.');
  await form.getByRole('button', { name: 'Reject: keep visible' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Decision saved - no action, the content stays visible.' }),
  ).toBeVisible({ timeout: 20_000 }); // the confirmation waits on its request (up to 20 s on a loaded runner)
  await expect(page.getByRole('heading', { name: 'Human decision' })).toBeVisible();
  await expect(page.getByText('Resolved').first()).toBeVisible();
});
