import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { openPage, signInAs, type DemoAccountKey } from './support/auth';
import { auditStyles } from './support/styleAudit';
import { uniqueWords } from './support/unique';

// My content, history, appeals and the appeal review (docs/03-ui-ux.md sec. 6.3, 6.4, 6.7, 6.8; APP-1..5, CNT-4,
// UX-1..4). Needs the seeded database (demo users, policy v1) and the mock AI. One fixture appeal is reused across
// runs: the author's post, limited by the senior moderator (Dana), appealed by the author, waiting for senior2.

// In order, in one worker: the tests share the fixture, and parallel workers would each create a copy of it and
// could run into the posting limit (SEC-4). The first test may also create the fixture (post, analysis, decision,
// appeal) before auditing five pages, which passes the 30 s default on a cold server.
test.describe.configure({ mode: 'default', timeout: 90_000 });

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE_URL).origin;
const FIXTURE_BODY = `UI suite appeal fixture: you are a worthless idiot. Long word check: ${'c'.repeat(90)}`;
const STATEMENT = 'I was quoting a film line that the whole thread was discussing, not insulting anyone.';

interface Fixture {
  appealId: string;
  contentId: string;
}

const post = (page: Page, path: string, data: unknown) =>
  page.request.post(path, { data, headers: { origin: ORIGIN } });

/** Posts `body` as the author, waits for the analysis and lets the senior moderator limit it under HAR-1. */
async function decidedPost(page: Page, body: string): Promise<{ contentId: string; decisionId: string }> {
  await signInAs(page, 'author');
  const created = await post(page, '/api/posts', { body });
  expect(created.status(), await created.text()).toBe(200);
  const { data: content } = (await created.json()) as { data: { id: string; caseId: string } };

  await signInAs(page, 'senior');
  let analysisId: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/cases/${content.caseId}`);
        const { data } = (await res.json()) as { data: { status: string; analysis: { id: string } | null } };
        analysisId = data.status === 'awaiting_review' ? (data.analysis?.id ?? null) : null;
        return analysisId;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  const decided = await post(page, `/api/cases/${content.caseId}/decisions`, {
    kind: 'modify',
    analysisId,
    finalAction: 'limit',
    clauseCodes: ['HAR-1'],
    reasonCategory: 'severity_too_low',
    rationale: 'Direct insult at another member.',
  });
  expect(decided.status(), await decided.text()).toBe(200);
  const { data: decision } = (await decided.json()) as { data: { decisionId: string } };
  return { contentId: content.id, decisionId: decision.decisionId };
}

/** The pending fixture appeal, created once and reused. */
async function ensureAppeal(page: Page): Promise<Fixture> {
  await signInAs(page, 'senior2');
  const list = await page.request.get('/api/appeals?limit=100');
  expect(list.status()).toBe(200);
  const { data } = (await list.json()) as {
    data: { items: Array<{ id: string; content: { id: string; excerpt: string } }> };
  };
  const existing = data.items.find((row) => FIXTURE_BODY.startsWith(row.content.excerpt.slice(0, 60)));
  if (existing) return { appealId: existing.id, contentId: existing.content.id };

  const decided = await decidedPost(page, FIXTURE_BODY);
  await signInAs(page, 'author');
  const appeal = await post(page, `/api/decisions/${decided.decisionId}/appeals`, {
    statement: STATEMENT,
    evidenceLinks: ['https://example.com/film-scene'],
  });
  expect(appeal.status(), await appeal.text()).toBe(200);
  const { data: created } = (await appeal.json()) as { data: { appealId: string } };
  return { appealId: created.appealId, contentId: decided.contentId };
}

/** The pages under test, with the account that opens each and the text that proves it rendered. */
function pages(f: Fixture): Array<{ name: string; account: DemoAccountKey; path: string; ready: RegExp | string }> {
  return [
    { name: 'my content', account: 'author', path: '/me', ready: 'Your posts and comments' },
    { name: 'history (author)', account: 'author', path: `/content/${f.contentId}/history`, ready: 'Timeline' },
    { name: 'history (staff)', account: 'senior2', path: `/content/${f.contentId}/history`, ready: 'Timeline' },
    { name: 'appeals', account: 'senior2', path: '/appeals', ready: 'Appeals list' },
    { name: 'appeal review', account: 'senior2', path: `/appeals/${f.appealId}`, ready: 'Original decision' },
  ];
}

async function expectReady(page: Page, ready: RegExp | string) {
  await expect(
    page
      .getByRole('region', { name: ready })
      .or(page.getByRole('list', { name: ready }))
      .first(),
  ).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`appeals and author pages, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] my content, history, appeals and the review have no serious axe violations at ${width}px (${scheme})`, async ({
        page,
      }) => {
        const fixture = await ensureAppeal(page);
        for (const target of pages(fixture)) {
          await signInAs(page, target.account);
          await openPage(page, target.path, width);
          await expectReady(page, target.ready);
          expect(await seriousAxeViolations(page), target.name).toEqual([]);
        }
      });

      test(`[UX-4] my content, history, appeals and the review pass the style audit at ${width}px (${scheme})`, async ({
        page,
      }) => {
        const fixture = await ensureAppeal(page);
        for (const target of pages(fixture)) {
          await signInAs(page, target.account);
          await openPage(page, target.path, width);
          await expectReady(page, target.ready);
          expect(await auditStyles(page, scheme), target.name).toEqual([]);
        }
      });
    }
  });
}

test('[UX-2] the appeal review and my content have no horizontal scroll from 320 to 1920 px', async ({ page }) => {
  const fixture = await ensureAppeal(page);
  await signInAs(page, 'senior2');
  await openPage(page, `/appeals/${fixture.appealId}`, 1280);
  for (const width of [320, 360, 390, 600, 840, 1200, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page), `review at ${width}px`).toBe(0);
  }
  await signInAs(page, 'author');
  await openPage(page, '/me', 320);
  expect(await horizontalOverflow(page)).toBe(0);
});

test('[UX-2] the review stacks its panels in a narrow pane and uses three columns on a wide screen', async ({
  page,
}) => {
  const fixture = await ensureAppeal(page);
  await signInAs(page, 'senior2');
  await openPage(page, `/appeals/${fixture.appealId}`, 1920);
  const original = await page.getByRole('region', { name: 'Original decision' }).boundingBox();
  const evidence = await page.getByRole('region', { name: 'Appeal evidence' }).boundingBox();
  const outcome = await page.getByRole('region', { name: 'Outcome' }).boundingBox();
  expect(evidence?.x ?? 0).toBeGreaterThan((original?.x ?? 0) + (original?.width ?? 0) - 1);
  expect(outcome?.x ?? 0).toBeGreaterThan((evidence?.x ?? 0) + (evidence?.width ?? 0) - 1);

  await page.setViewportSize({ width: 900, height: 900 });
  const narrowOriginal = await page.getByRole('region', { name: 'Original decision' }).boundingBox();
  const narrowEvidence = await page.getByRole('region', { name: 'Appeal evidence' }).boundingBox();
  expect(narrowEvidence?.y ?? 0).toBeGreaterThan(narrowOriginal?.y ?? 0);
});

test('[APP-3] the original decider sees the blocked message with the controls disabled', async ({ page }) => {
  const fixture = await ensureAppeal(page);
  await signInAs(page, 'senior');
  await openPage(page, `/appeals/${fixture.appealId}`, 1280);
  await expect(
    page.getByText('You made the original decision - another senior moderator must review this.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose an outcome' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Overturn' })).toHaveAttribute('aria-disabled', 'true');
});

test('[APP-4] the review shows the three panels and the AI summary that does not recommend an outcome', async ({
  page,
}) => {
  const fixture = await ensureAppeal(page);
  await signInAs(page, 'senior2');
  await openPage(page, `/appeals/${fixture.appealId}`, 1280);
  await expect(page.getByRole('region', { name: 'Original decision' }).getByText('HAR-1').first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Appeal evidence' }).getByText(STATEMENT, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Outcome' }).getByText('Pending')).toBeVisible();
  // The brief job runs in after(); the page polls until it lands.
  const brief = page.getByRole('group', { name: 'AI summary' });
  await expect(brief.getByText('Does not recommend an outcome. A senior moderator decides.')).toBeVisible();
  await expect(brief.getByRole('heading', { name: 'Disputed findings' })).toBeVisible({ timeout: 30_000 });
});

test('[APP-1] [APP-5] the author appeals at 360 px and a different senior overturns it', async ({ page }) => {
  const decided = await decidedPost(page, `UI appeal journey ${uniqueWords()}: you are a worthless idiot`);

  // The author appeals from My content: inline validation first, then success.
  await signInAs(page, 'author');
  await openPage(page, '/me', 360);
  const item = page.getByRole('listitem').filter({ hasText: 'UI appeal journey' }).first();
  await item.getByRole('button', { name: /^Appeal - until/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Appeal this decision' });
  await dialog.getByRole('button', { name: 'Send appeal' }).click();
  await expect(dialog.getByText('Explain your appeal in at least 20 characters.')).toBeVisible();
  await expect(dialog.getByLabel(/Why should the decision change/)).toBeFocused();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await dialog.getByLabel(/Why should the decision change/).fill(STATEMENT);
  await dialog.getByRole('button', { name: 'Send appeal' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Appeal sent. A senior moderator will review it.' }),
  ).toBeVisible();
  await expect(item.getByText('Appeal sent. A senior moderator will review it.')).toBeVisible();

  // A senior moderator who did not decide overturns it.
  await signInAs(page, 'senior2');
  const list = await page.request.get('/api/appeals?limit=100');
  const { data } = (await list.json()) as { data: { items: Array<{ id: string; content: { id: string } }> } };
  const appeal = data.items.find((row) => row.content.id === decided.contentId);
  expect(appeal).toBeDefined();
  await openPage(page, `/appeals/${appeal?.id ?? ''}`, 1280);
  const form = page.getByRole('form', { name: 'Resolve the appeal' });
  await form.getByRole('radio', { name: 'Overturn' }).click();
  await form.getByLabel(/Rationale/).fill('It quotes the film the thread is about.');
  await form.getByRole('button', { name: 'Overturn: make it visible again' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Appeal resolved - decision overturned, the content is visible again.' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Outcome' }).getByText('Overturned')).toBeVisible();

  // The author sees the outcome in My content and on the history page.
  await signInAs(page, 'author');
  await openPage(page, '/me', 360);
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'UI appeal journey' })
      .first()
      .getByText('A senior moderator overturned the decision. Your content is visible again.'),
  ).toBeVisible();
  await openPage(page, `/content/${decided.contentId}/history`, 360);
  await expect(page.getByText('Appeal overturned')).toBeVisible();
});
