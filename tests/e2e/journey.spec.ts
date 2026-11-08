import { expect, test, type Page } from '@playwright/test';
import { openPage, signInAs } from '../ui/support/auth';
import { uniqueWords } from '../ui/support/unique';

// The cross-role journey (docs/05-test-plan.md sec. 7) through real pages, with the mock AI provider and the
// seeded demo users: the author posts, a senior moderator decides, the author appeals, the decider is refused the
// second review (and the refusal is audited), another senior overturns, and the admin checks the audit chain and
// the metrics. It runs at 1280 px and at 390 px. Each run makes its own post with a random-word suffix, so it never
// depends on data an earlier run left behind (and a fresh, seeded database is enough).
//
// The post carries [mock:timeout]: the mock AI then never answers and the pipeline's own timeout and deadline end
// the AI step. That keeps the item in "Analysing..." long enough to see it every time (no race with a fast mock),
// and the case still arrives for review with its rule finding (DET-5). The steps share state, so they run in order.

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE_URL).origin;
// The analysis waits for the AI deadline (AI_DEADLINE_MS, 25 s by default) before the case is ready.
const ANALYSIS_TIMEOUT_MS = 60_000;

function status(page: Page, text: string | RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}

for (const width of [1280, 390]) {
  test.describe(`journey at ${width}px`, () => {
    const words = uniqueWords();
    const body = `Journey ${words}: you are a worthless idiot [mock:timeout]`;
    const statement = 'I was quoting a line from the film the whole thread was talking about, not insulting anyone.';
    const run = { appealId: '', deniedRequestId: '' };

    test(`[CNT-1] the author posts from the feed, sees "Analysing..." and then the item is ready (${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/sign-in');
      await page.getByRole('button', { name: /Asha Rao/ }).click();
      await expect(page).toHaveURL(/\/feed$/);
      await page.getByLabel('Write a post').fill(body);
      await page.getByRole('button', { name: 'Post', exact: true }).click();
      await expect(status(page, /^Posted - being checked against policy v\d+\.$/)).toBeVisible();

      const card = page.getByRole('article').filter({ hasText: words });
      await expect(card.getByText('Analysing...')).toBeVisible();
      // The feed polls while the item is analysing; no reload, no fixed wait.
      await expect(card.getByText('Analysing...')).toBeHidden({ timeout: ANALYSIS_TIMEOUT_MS });
      await expect(card.getByText(body)).toBeVisible();
    });

    test(`[HUM-4] [DET-5] the senior opens it from the queue, sees the evidence and the reasons, and limits it (${width}px)`, async ({
      page,
    }) => {
      await signInAs(page, 'senior');
      await openPage(page, '/queue', width);
      await page.getByLabel('Search cases').fill(words);
      await page
        .getByRole('link', { name: new RegExp(words) })
        .first()
        .click();
      await expect(page).toHaveURL(/\/queue\/[^/?]+/);

      // The quote is highlighted with its clause, and the server's reasons for a human decision are listed.
      await expect(page.getByLabel(/^Evidence for HAR-1:/).first()).toBeVisible();
      await expect(page.getByRole('group', { name: 'Finding HAR-1' }).first()).toBeVisible();
      const reasons = page.getByRole('group', { name: 'Why a human must decide' });
      await expect(reasons.getByRole('listitem').first()).toBeVisible();

      // Three option cards state their effect; the button says exactly what will happen.
      const form = page.getByRole('form', { name: 'Decide on the recommendation' });
      await form.getByRole('radio', { name: 'Modify' }).click();
      const clause = form.getByRole('checkbox', { name: 'HAR-1' });
      if ((await clause.getAttribute('aria-checked')) !== 'true') await clause.click();
      await form.getByRole('radio', { name: 'Limit' }).click();
      await form.getByRole('radio', { name: 'Severity too low' }).click();
      await form.getByLabel(/Rationale/).fill('A direct insult aimed at another member; limit its reach.');
      await form.getByRole('button', { name: 'Modify: limit under HAR-1' }).click();
      await expect(status(page, 'Decision saved - content limited under HAR-1.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Human decision' })).toBeVisible();
    });

    test(`[APP-1] the author sees the decision with its clause in My content and appeals (${width}px)`, async ({
      page,
    }) => {
      await signInAs(page, 'author');
      await openPage(page, '/me', width);
      const item = page.getByRole('listitem').filter({ hasText: words }).first();
      await expect(item.getByText('A moderator limited this under HAR-1 (Harassment and insults).')).toBeVisible();
      await expect(item.getByText('Limit', { exact: true })).toBeVisible();

      await item.getByRole('button', { name: /^Appeal - until/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Appeal this decision' });
      await dialog.getByLabel(/Why should the decision change/).fill(statement);
      await dialog.getByRole('button', { name: 'Send appeal' }).click();
      await expect(status(page, 'Appeal sent. A senior moderator will review it.')).toBeVisible();
      await expect(item.getByText('Appeal sent. A senior moderator will review it.')).toBeVisible();
    });

    test(`[APP-3] [AUD-4] the original decider is blocked from the review, and the admin sees the denial in the audit (${width}px)`, async ({
      page,
    }) => {
      await signInAs(page, 'senior');
      await openPage(page, '/appeals', width);
      await page
        .getByRole('link', { name: new RegExp(words) })
        .first()
        .click();
      await expect(page).toHaveURL(/\/appeals\/[^/?]+/);
      run.appealId = new URL(page.url()).pathname.split('/').pop() ?? '';
      await expect(
        page.getByText('You made the original decision - another senior moderator must review this.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Choose an outcome' })).toBeDisabled();

      // The page offers no way to resolve, so the decider tries the API directly with their own session.
      const forced = await page.request.post(`/api/appeals/${run.appealId}/resolve`, {
        data: { outcome: 'overturn', rationale: 'Trying to review my own decision.' },
        headers: { origin: ORIGIN },
      });
      expect(forced.status()).toBe(403);
      expect(((await forced.json()) as { error: { code: string } }).error.code).toBe('SAME_REVIEWER');
      run.deniedRequestId = forced.headers()['x-request-id'] ?? '';
      expect(run.deniedRequestId).not.toBe('');

      await signInAs(page, 'admin');
      await openPage(page, `/audit?q=${encodeURIComponent(run.deniedRequestId)}`, width);
      const events = page.getByRole('region', { name: 'Events' });
      // The table (>= 840 px) and the list (below) are both in the page; only one is shown.
      await expect(events.getByText('Access denied', { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(
        events
          .getByText(/Dana Okafor/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });

    test(`[APP-5] [CNT-4] a different senior overturns it; the item is visible again with the outcome in its history (${width}px)`, async ({
      page,
    }) => {
      await signInAs(page, 'senior2');
      await openPage(page, '/appeals', width);
      await page
        .getByRole('link', { name: new RegExp(words) })
        .first()
        .click();
      const form = page.getByRole('form', { name: 'Resolve the appeal' });
      await form.getByRole('radio', { name: 'Overturn' }).click();
      await form.getByLabel(/Rationale/).fill('The words quote the film the thread is about, not a member.');
      await form.getByRole('button', { name: 'Overturn: make it visible again' }).click();
      await expect(status(page, 'Appeal resolved - decision overturned, the content is visible again.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Outcome' }).getByText('Overturned')).toBeVisible();

      await signInAs(page, 'author');
      await openPage(page, '/feed', width);
      const card = page.getByRole('article').filter({ hasText: words });
      await expect(card.getByText(body)).toBeVisible();
      await expect(card.getByText('Limited', { exact: true })).toHaveCount(0);

      await openPage(page, '/me', width);
      const item = page.getByRole('listitem').filter({ hasText: words }).first();
      await item.getByRole('link', { name: 'History' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Moderation history' })).toBeVisible();
      await expect(page.getByText('Appeal overturned')).toBeVisible();
      await expect(
        page.getByText('A senior moderator overturned the decision. Your content is visible again.'),
      ).toBeVisible();
    });

    test(`[AUD-3] [OPS-6] the admin sees an intact audit chain and the decision in the metrics (${width}px)`, async ({
      page,
    }) => {
      await signInAs(page, 'admin');
      await openPage(page, '/audit', width);
      await expect(page.getByText(/^Audit chain intact, [\d,]+ events? verified\.$/)).toBeVisible();

      await openPage(page, '/metrics', width);
      // This journey's modify decision is an override, so the count is at least 1 even on a fresh database.
      await expect(page.getByRole('region', { name: 'Overrides' }).getByText(/^[1-9][\d,]*$/)).toBeVisible();
    });
  });
}
