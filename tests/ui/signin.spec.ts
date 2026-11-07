import { expect, test } from '@playwright/test';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { HOME, openPage, type DemoAccountKey } from './support/auth';
import { auditStyles } from './support/styleAudit';

// The sign-in page and the demo cards (docs/03-ui-ux.md sec. 6.1, UX-5). Needs the seeded database and
// DEMO_MODE=true.

const ACCOUNTS: Array<{ key: DemoAccountKey; name: string; firstNavItem: string }> = [
  { key: 'author', name: 'Asha Rao', firstNavItem: 'Feed' },
  { key: 'author2', name: 'Ben Ortiz', firstNavItem: 'Feed' },
  { key: 'moderator', name: 'Chen Wei', firstNavItem: 'Queue' },
  { key: 'senior', name: 'Dana Okafor', firstNavItem: 'Queue' },
  { key: 'senior2', name: 'Elif Demir', firstNavItem: 'Queue' },
  { key: 'admin', name: 'Femi Adeyemi', firstNavItem: 'Policy' },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`sign-in, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const width of [360, 1280]) {
      test(`[UX-3] /sign-in has no serious or critical axe violations at ${width}px (${scheme})`, async ({ page }) => {
        await openPage(page, '/sign-in', width);
        expect(await seriousAxeViolations(page)).toEqual([]);
      });

      test(`[UX-4] /sign-in passes the style audit at ${width}px (${scheme})`, async ({ page }) => {
        await openPage(page, '/sign-in', width);
        expect(await auditStyles(page, scheme)).toEqual([]);
      });
    }
  });
}

test('[UX-2] /sign-in has no horizontal scroll from 320 to 1920 px', async ({ page }) => {
  await openPage(page, '/sign-in', 1280);
  for (const width of [320, 360, 600, 840, 1200, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
  }
});

test('[UX-3] /sign-in has one main landmark, exactly one h1 and a link to the status page', async ({ page }) => {
  await openPage(page, '/sign-in', 1280);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await expect(page.getByRole('link', { name: 'System status' })).toHaveAttribute('href', '/status');
});

test('[UX-5] shows one demo card per seeded account', async ({ page }) => {
  await openPage(page, '/sign-in', 1280);
  await expect(page.locator('[data-demo-account]')).toHaveCount(ACCOUNTS.length);
});

for (const account of ACCOUNTS) {
  test(`[UX-5] one click signs in as ${account.key} and opens its home with its navigation`, async ({ page }) => {
    await openPage(page, '/sign-in', 1280);
    await page.getByRole('button', { name: new RegExp(account.name) }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME[account.key]}$`));
    const drawer = page.locator('[data-nav="drawer"]');
    await expect(drawer.getByRole('link').first()).toHaveText(account.firstNavItem);
    await expect(page.getByRole('button', { name: new RegExp(`^Account: ${account.name}`) })).toBeVisible();
  });
}

test('[UX-3] a demo card can be used with the keyboard alone', async ({ page }) => {
  await openPage(page, '/sign-in', 1280);
  const card = page.getByRole('button', { name: /Chen Wei/ });
  for (let i = 0; i < 20 && !(await card.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/queue$/);
});

test('[SEC-1] a signed-out visit to a page goes to sign-in and comes back after signing in', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/audit');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faudit$/);
  await page.getByRole('button', { name: /Chen Wei/ }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit');
});
