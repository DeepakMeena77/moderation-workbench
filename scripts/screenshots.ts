// README screenshots (docs/05-test-plan.md sec. 6.6). Not part of verify or CI.
//
// Usage: build and start the app against a freshly seeded database (demo mode, mock AI), then
//   npx tsx scripts/screenshots.ts                      # BASE_URL defaults to http://127.0.0.1:3000
//   BASE_URL=http://127.0.0.1:3001 npx tsx scripts/screenshots.ts
//   BASE_URL=https://<live-url> npx tsx scripts/screenshots.ts --only=status   # creates no data
//
// A production build with the mock AI shows the status page red ("mock AI in production", by design), so take
// status.png from the live deployment with --only=status.
//
// It signs in as the demo users through the API and creates ordinary community data the way people would: a few
// posts, a decision, an appeal and (when only v1 exists) policy v2, so the compare view has something to show.
// Re-running it reuses what is already there instead of posting duplicates. Then it saves light-theme PNGs to
// docs/screenshots. Run it on a fresh database: anything already in the database shows up in the pictures too.

import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = new URL(BASE_URL).origin;
const OUT_DIR = join(process.cwd(), 'docs', 'screenshots');
const MAX_BYTES = 300 * 1024;
const POLL_MS = 1000;
const POLL_LIMIT_MS = 90_000;

type Account = 'author' | 'author2' | 'moderator' | 'senior' | 'senior2' | 'admin';

const POSTS: Array<{ account: Account; body: string }> = [
  {
    account: 'author2',
    body: 'Anyone tried the new cycle lane on Harbour Road? It took ten minutes off my commute this morning.',
  },
  {
    account: 'author',
    body: 'Reminder: the community garden clean-up is on Saturday at 9. Bring gloves - we will have tea and biscuits.',
  },
  {
    account: 'author2',
    body: "Honestly, you're a pathetic loser if you still think the night bus timetable works for anyone.",
  },
  {
    account: 'author',
    body: 'That referee was a complete idiot tonight. Three offsides missed in one half and nobody said a word!',
  },
  {
    account: 'author2',
    body: 'Spare tickets for the jazz night - email ben.ortiz.tickets@example.com if you want them before Friday.',
  },
  {
    account: 'author2',
    body: "Guaranteed returns: double your money in a week. Send crypto to my wallet and I'll show you how it works.",
  },
  {
    account: 'author',
    body: 'Selling my old road bike, barely used. Photos at https://bikes.example/one and https://bikes.example/two.',
  },
];
const DISPUTED = POSTS[3]?.body ?? '';
const TO_REVIEW = POSTS[2]?.body ?? '';
const APPEAL_STATEMENT =
  'I was talking about the match referee on TV, not about anyone here. It was a comment on the football, ' +
  'and the thread was about the game.';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll<T>(what: string, read: () => Promise<T | null>): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < POLL_LIMIT_MS) {
    const value = await read();
    if (value !== null) return value;
    await sleep(POLL_MS);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

async function json<T>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { data: T }).data;
}

async function signIn(api: APIRequestContext, account: Account): Promise<void> {
  await json(await api.post('/api/auth/demo', { data: { account }, headers: { origin: ORIGIN } }), `sign in ${account}`);
}

const post = (api: APIRequestContext, path: string, data: unknown) =>
  api.post(path, { data, headers: { origin: ORIGIN } });

interface CaseRow {
  id: string;
  status: string;
  content: { id: string; excerpt: string };
}

async function findCase(api: APIRequestContext, body: string, status: string): Promise<CaseRow | null> {
  const query = new URLSearchParams({ q: body.slice(0, 40), status, limit: '50' });
  const page = await json<{ items: CaseRow[] }>(await api.get(`/api/cases?${query}`), 'list cases');
  return page.items.find((row) => body.startsWith(row.content.excerpt.slice(0, 40))) ?? null;
}

/** Policy v2 makes the compare view meaningful. Published once; later runs see two versions and skip it. */
async function ensureTwoPolicyVersions(api: APIRequestContext): Promise<void> {
  await signIn(api, 'admin');
  const { versions } = await json<{ versions: unknown[] }>(await api.get('/api/policies'), 'list policies');
  if (versions.length >= 2) return;
  const text = readFileSync(join(process.cwd(), 'policies', 'policy.v2.json'), 'utf8');
  await json(await post(api, '/api/policies', { json: text }), 'publish policy v2');
  console.log('Published policy v2 for the compare view.');
}

async function ensurePosts(api: APIRequestContext): Promise<void> {
  for (const account of ['author', 'author2'] as const) {
    await signIn(api, account);
    const mine = await json<{ items: Array<{ body: string }> }>(await api.get('/api/me/content?limit=50'), 'my content');
    for (const item of POSTS.filter((p) => p.account === account)) {
      if (mine.items.some((existing) => existing.body === item.body)) continue;
      await json(await post(api, '/api/posts', { body: item.body }), `post as ${account}`);
    }
  }
}

/** Waits for the analyses, limits the disputed post as the senior moderator, and returns the case to review. */
async function ensureDecision(api: APIRequestContext): Promise<{ reviewCaseId: string }> {
  await signIn(api, 'senior');
  // Every post is analysed before any picture is taken, so the queue never shows "Analysing...".
  await poll('the analyses', async () => {
    const pending = await json<{ total: number }>(await api.get('/api/cases?status=pending_analysis'), 'pending');
    return pending.total === 0 ? true : null;
  });
  const review = await poll('the case to review', () => findCase(api, TO_REVIEW, 'awaiting_review'));
  const alreadyDecided =
    (await findCase(api, DISPUTED, 'awaiting_review')) === null &&
    (await findCase(api, DISPUTED, 'pending_analysis')) === null;
  if (!alreadyDecided) {
    const disputed = await poll('the disputed case', () => findCase(api, DISPUTED, 'awaiting_review'));
    const detail = await json<{ analysis: { id: string } | null }>(
      await api.get(`/api/cases/${disputed.id}`),
      'case detail',
    );
    await json(
      await post(api, `/api/cases/${disputed.id}/decisions`, {
        kind: 'modify',
        analysisId: detail.analysis?.id,
        finalAction: 'limit',
        clauseCodes: ['HAR-1'],
        reasonCategory: 'severity_too_low',
        rationale: 'Name-calling in a public thread; limiting reach rather than labelling.',
      }),
      'decide',
    );
  }
  return { reviewCaseId: review.id };
}

/** The author appeals the limit; returns the appeal once its AI brief is written. */
async function ensureAppeal(api: APIRequestContext): Promise<{ appealId: string }> {
  await signIn(api, 'author');
  const mine = await json<{
    items: Array<{ body: string; decision: { id: string } | null; appeal: { id: string } | null }>;
  }>(await api.get('/api/me/content?limit=50'), 'my content');
  const item = mine.items.find((i) => i.body === DISPUTED);
  if (!item?.decision) throw new Error('The disputed post has no decision yet.');
  let appealId = item.appeal?.id ?? null;
  if (!appealId) {
    const created = await json<{ appealId: string }>(
      await post(api, `/api/decisions/${item.decision.id}/appeals`, {
        statement: APPEAL_STATEMENT,
        evidenceLinks: ['https://example.com/match-report'],
      }),
      'appeal',
    );
    appealId = created.appealId;
  }
  await signIn(api, 'senior2');
  const id = appealId;
  await poll('the appeal brief', async () => {
    const detail = await json<{ brief: { state: string } }>(await api.get(`/api/appeals/${id}`), 'appeal detail');
    return detail.brief.state === 'pending' ? null : true;
  });
  return { appealId: id };
}

async function settle(page: Page): Promise<void> {
  await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible' });
  // Skeletons are inside aria-busy regions; wait until none is left, then let fonts and layout settle.
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, undefined, {
    timeout: 30_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

async function shoot(
  context: BrowserContext,
  account: Account | null,
  path: string,
  file: string,
  prepare?: (page: Page) => Promise<void>,
): Promise<void> {
  if (account) await signIn(context.request, account);
  // No account: the public view (the status page), so sign the context out first.
  else await post(context.request, '/api/auth/sign-out', {});
  const page = await context.newPage();
  try {
    await page.goto(path);
    await settle(page);
    if (prepare) await prepare(page);
    const target = join(OUT_DIR, file);
    await page.screenshot({ path: target, animations: 'disabled', caret: 'hide' });
    const size = statSync(target).size;
    console.log(`${file}: ${Math.round(size / 1024)} KB${size > MAX_BYTES ? ' (over the 300 KB budget)' : ''}`);
  } finally {
    await page.close();
  }
}

/** Scrolls so the compare card's heading sits just below the sticky top app bar. */
async function showCompare(page: Page): Promise<void> {
  const top = await page
    .getByRole('region', { name: 'Compare versions' })
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 88)), top);
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0);
}

interface Shot {
  account: Account | null;
  path: (ids: { reviewCaseId: string; appealId: string }) => string;
  mobile?: boolean;
  prepare?: (page: Page) => Promise<void>;
}

const SHOTS = new Map<string, Shot>([
  ['feed', { account: 'author', path: () => '/feed' }],
  ['case-review-desktop', { account: 'senior', path: (ids) => `/queue/${ids.reviewCaseId}` }],
  ['case-review-mobile', { account: 'senior', path: (ids) => `/queue/${ids.reviewCaseId}`, mobile: true }],
  ['queue', { account: 'senior', path: () => '/queue' }],
  ['appeal-review', { account: 'senior2', path: (ids) => `/appeals/${ids.appealId}` }],
  ['my-content', { account: 'author', path: () => '/me' }],
  ['policy-compare', { account: 'moderator', path: () => '/policy', prepare: showCompare }],
  ['audit', { account: 'admin', path: () => '/audit' }],
  ['metrics', { account: 'admin', path: () => '/metrics' }],
  ['status', { account: null, path: () => '/status' }],
]);

// --only=feed,status takes just those screenshots.
const ONLY = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .filter(Boolean);
const wanted = (name: string) => !ONLY || ONLY.includes(name);

async function main(): Promise<void> {
  const unknown = (ONLY ?? []).filter((name) => !SHOTS.has(name));
  if (unknown.length > 0) throw new Error(`Unknown screenshot(s): ${unknown.join(', ')}. Known: ${[...SHOTS.keys()].join(', ')}.`);
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const desktop = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 860 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const mobile = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });

    // Only the public status page needs no data, so --only=status writes nothing to the target (for example the
    // live URL, where the status page shows the real provider instead of the mock).
    let ids = { reviewCaseId: '', appealId: '' };
    if ([...SHOTS.keys()].some((name) => name !== 'status' && wanted(name))) {
      const api = desktop.request;
      await ensureTwoPolicyVersions(api);
      await ensurePosts(api);
      const { reviewCaseId } = await ensureDecision(api);
      const { appealId } = await ensureAppeal(api);
      ids = { reviewCaseId, appealId };
    }

    for (const [name, shot] of SHOTS) {
      if (!wanted(name)) continue;
      await shoot(shot.mobile ? mobile : desktop, shot.account, shot.path(ids), `${name}.png`, shot.prepare);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
