import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs } from './support/auth';
import { auditStyles } from './support/styleAudit';
import { uniqueWords } from './support/unique';

// The Feed page (docs/03-ui-ux.md sec. 6.2; CNT-1..3, CNT-5, UX-1..4). Needs the seeded database (policy v1).

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE_URL).origin;
// One long unbroken word, so the overflow checks also cover long content (03 sec. 5).
const FIXTURE_BODY = `UI suite post from Ben. Long word check: ${'a'.repeat(90)}`;

/**
 * Makes sure author2 has a post the author can see and report on the feed's first page. Reuses one that is still
 * there (to stay under SEC-4); once newer posts have pushed it off the first page, it posts a fresh one.
 */
async function ensurePostByAuthor2(page: Page): Promise<void> {
  await signInAs(page, 'author2');
  // The default page size, exactly what /feed shows first.
  const feed = await page.request.get('/api/posts');
  expect(feed.status()).toBe(200);
  const { data } = (await feed.json()) as { data: { items: Array<{ isOwn: boolean; body: string }> } };
  if (!data.items.some((item) => item.isOwn && item.body === FIXTURE_BODY)) {
    const res = await page.request.post('/api/posts', { data: { body: FIXTURE_BODY }, headers: { origin: ORIGIN } });
    expect(res.status(), await res.text()).toBe(200);
  }
}

async function openFeedAsAuthor(page: Page, width: number): Promise<void> {
  await ensurePostByAuthor2(page);
  await signInAs(page, 'author');
  await openPage(page, '/feed', width);
  await expect(page.getByRole('article').first()).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`feed, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] the feed has no serious or critical axe violations at ${width}px (${scheme})`, async ({ page }) => {
        await openFeedAsAuthor(page, width);
        expect(await seriousAxeViolations(page)).toEqual([]);
      });

      test(`[UX-4] the feed passes the style audit at ${width}px (${scheme})`, async ({ page }) => {
        await openFeedAsAuthor(page, width);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });

      test(`[CNT-3] the open report ${width < 600 ? 'sheet' : 'dialog'} is accessible and styled (${scheme}, ${width}px)`, async ({
        page,
      }) => {
        await openFeedAsAuthor(page, width);
        const card = page.getByRole('article').filter({ hasText: 'UI suite post from Ben' }).first();
        await card.getByRole('button', { name: /^Report post by/ }).click();
        const dialog = page.getByRole('dialog', { name: 'Report this post' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Submit report' }).click();
        await expect(dialog.getByText('Choose a reason.')).toBeVisible();
        expect(await seriousAxeViolations(page)).toEqual([]);
        expect(await auditStyles(page, scheme)).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      });
    }

    test(`[CNT-1] composer validation is inline and accessible (${scheme})`, async ({ page }) => {
      await signInAs(page, 'author');
      await openPage(page, '/feed', 360);
      // The feed list is fetched on the client, so once it shows the page is hydrated and the click is handled.
      await expect(page.getByRole('article').first().or(page.getByText('No posts yet.'))).toBeVisible();
      await page.getByRole('button', { name: 'Post', exact: true }).click();
      await expect(page.getByText('Write at least 1 character.')).toBeVisible();
      await expect(page.getByLabel('Write a post')).toBeFocused();
      expect(await seriousAxeViolations(page)).toEqual([]);
      expect(await auditStyles(page, scheme)).toEqual([]);
    });
  });
}

test('[UX-2] the feed with long content has no horizontal scroll from 320 to 1920 px', async ({ page }) => {
  await openFeedAsAuthor(page, 1280);
  for (const width of [320, 360, 390, 600, 840, 1200, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
  }
});

test('[CNT-1] a new post appears at once and gets its rule-only analysis within seconds, with no manual action', async ({
  page,
}) => {
  await signInAs(page, 'author');
  await openPage(page, '/feed', 1280);
  const text = `UI check ${uniqueWords()}: you are a worthless idiot`;
  await page.getByLabel('Write a post').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Posted - being checked against policy v\d+\.$/ }),
  ).toBeVisible();
  const card = page.getByRole('article').filter({ hasText: text });
  await expect(card).toBeVisible();
  await expect(page.getByLabel('Write a post')).toHaveValue('');
  // The job runs in after() on the post request; the feed polls every 2 s while the item is analysing.
  await expect(card.getByText('Analysing...')).toBeHidden({ timeout: 20_000 });
});

test('[CNT-5] staff read the feed without a composer', async ({ page }) => {
  await ensurePostByAuthor2(page);
  await signInAs(page, 'moderator');
  await openPage(page, '/feed', 1280);
  await expect(page.getByRole('article').first()).toBeVisible();
  await expect(page.getByLabel('Write a post')).toHaveCount(0);
});
