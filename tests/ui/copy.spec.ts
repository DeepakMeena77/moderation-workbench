import { expect, test, type Page } from '@playwright/test';
import { openPage, signInAs, type DemoAccountKey } from './support/auth';

// Every page, as each role, at 390 and 1280 px (docs/03-ui-ux.md sec. 7; UX-1): once loaded, the visible text holds
// no raw JSON, no ISO timestamp, no "undefined", "null", "NaN" or "[object Object]", and no internal code on its
// own (snake_case enum values, SCREAMING_CASE error codes). Reads only; detail pages use whatever the list APIs
// return, so the walk works on any seeded database. The audit page is walked with its rows collapsed: an expanded
// row shows the stored JSON on purpose.

test.describe.configure({ timeout: 120_000 });

interface Visit {
  path: string;
  /** Pages that answer Forbidden for this role still have to read well. */
  note?: string;
}

const RAW_PATTERNS: Array<[string, RegExp]> = [
  ['an ISO timestamp', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/],
  ['raw JSON', /[{[]\s*"[A-Za-z]+"\s*:/],
  ['"undefined"', /\bundefined\b/],
  ['"null"', /\bnull\b/],
  ['"NaN"', /\bNaN\b/],
  ['"[object Object]"', /\[object Object\]/],
  ['a snake_case code', /\b[a-z]+_[a-z]+(?:_[a-z]+)*\b/],
  ['an error code', /\b[A-Z]{3,}_[A-Z_]{3,}\b/],
];

async function firstId(page: Page, path: string, pick: (data: unknown) => string | undefined): Promise<string | null> {
  const res = await page.request.get(path);
  if (res.status() !== 200) return null;
  const { data } = (await res.json()) as { data: unknown };
  return pick(data) ?? null;
}

const items = (data: unknown) => ((data as { items?: Array<{ id: string }> }).items ?? []).map((i) => i.id);

async function visitsFor(page: Page, role: DemoAccountKey): Promise<Visit[]> {
  await signInAs(page, role);
  const common: Visit[] = [{ path: '/feed' }, { path: '/policy' }, { path: '/status' }, { path: '/no-such-page' }];
  if (role === 'author') {
    const contentId = await firstId(page, '/api/me/content', (d) => items(d)[0]);
    return [
      ...common,
      { path: '/me' },
      { path: '/queue', note: 'forbidden' },
      { path: '/audit', note: 'forbidden' },
      ...(contentId ? [{ path: `/content/${contentId}/history` }] : []),
    ];
  }
  const caseId = await firstId(page, '/api/cases?status=awaiting_review', (d) => items(d)[0]);
  const resolvedId = await firstId(page, '/api/cases?status=auto_cleared', (d) => items(d)[0]);
  const appealId = await firstId(page, '/api/appeals?limit=5', (d) => items(d)[0]);
  const contentId = caseId
    ? await firstId(page, `/api/cases/${caseId}`, (d) => (d as { content?: { id: string } }).content?.id)
    : null;
  return [
    ...common,
    { path: '/queue' },
    { path: '/appeals' },
    { path: '/audit' },
    { path: '/metrics' },
    { path: '/me', note: 'forbidden' },
    ...(caseId ? [{ path: `/queue/${caseId}` }] : []),
    ...(resolvedId ? [{ path: `/queue/${resolvedId}` }] : []),
    ...(appealId ? [{ path: `/appeals/${appealId}` }] : []),
    ...(contentId ? [{ path: `/content/${contentId}/history` }] : []),
  ];
}

async function rawTextProblems(page: Page): Promise<string[]> {
  // Loaded: no skeleton or "Loading" region left.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
  const text = await page.locator('body').innerText();
  const found = RAW_PATTERNS.flatMap(([what, pattern]) =>
    [...text.matchAll(new RegExp(pattern.source, 'g'))].map(
      (m) => `${what}: "${text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}"`,
    ),
  );
  return [...new Set(found)];
}

for (const role of ['author', 'moderator', 'senior', 'admin'] as const) {
  for (const width of [390, 1280]) {
    test(`[UX-1] every page reads as words for ${role} at ${width}px: no raw JSON, ISO times, codes or "undefined"`, async ({
      page,
    }) => {
      const visits = await visitsFor(page, role);
      const problems: string[] = [];
      for (const visit of visits) {
        await openPage(page, visit.path, width);
        for (const problem of await rawTextProblems(page)) problems.push(`${visit.path}: ${problem}`);
      }
      expect(problems).toEqual([]);
    });
  }
}

test('[UX-1] the public pages read as words when signed out', async ({ page }) => {
  const problems: string[] = [];
  for (const path of ['/sign-in', '/status', '/no-such-page']) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      for (const problem of await rawTextProblems(page)) problems.push(`${path} at ${width}px: ${problem}`);
    }
  }
  expect(problems).toEqual([]);
});
