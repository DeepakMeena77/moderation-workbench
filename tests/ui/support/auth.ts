import { expect, type Page } from '@playwright/test';

// Signs a browser context in as a seeded demo account through the API, so pages under test start signed in
// without clicking through the sign-in page. tests/ui/signin.spec.ts covers the cards themselves.

export type DemoAccountKey = 'author' | 'author2' | 'moderator' | 'senior' | 'senior2' | 'admin';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

/** Each role's home page (src/ui/shell/navigation.ts homeFor). */
export const HOME: Record<DemoAccountKey, string> = {
  author: '/feed',
  author2: '/feed',
  moderator: '/queue',
  senior: '/queue',
  senior2: '/queue',
  admin: '/policy',
};

export async function signInAs(page: Page, account: DemoAccountKey): Promise<void> {
  // The API's CSRF check wants a same-origin Origin header, as a browser sends from our own pages.
  const res = await page.request.post('/api/auth/demo', {
    data: { account },
    headers: { origin: new URL(BASE_URL).origin },
  });
  expect(res.status(), `demo sign-in as ${account}: ${await res.text()}`).toBe(200);
}

/** Opens a page and waits until its h1 is visible, so audits run on the rendered page, not a skeleton. */
export async function openPage(page: Page, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
