import { expect, test, type Page } from '@playwright/test';
import { tokens } from '../../src/ui/theme/tokens';
import { horizontalOverflow, seriousAxeViolations } from './support/a11y';
import { HOME, openPage, signInAs, type DemoAccountKey } from './support/auth';
import { auditStyles } from './support/styleAudit';

// The signed-in app shell (docs/03-ui-ux.md sec. 3 and sec. 5; UX-2..5, SEC-1). Needs the seeded database.

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// Every page the shell can show in S1: each role's home, the 403 view and the 404 page.
const PAGES: Array<{ name: string; account: DemoAccountKey; path: string }> = [
  { name: 'author feed', account: 'author', path: HOME.author },
  { name: 'moderator queue', account: 'moderator', path: HOME.moderator },
  { name: 'senior appeals', account: 'senior', path: '/appeals' },
  { name: 'admin policy', account: 'admin', path: HOME.admin },
  { name: 'forbidden (author on /queue)', account: 'author', path: '/queue' },
  { name: 'not found', account: 'author', path: '/no-such-page' },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`shell, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const target of PAGES) {
      for (const width of [360, 1280]) {
        test(`[UX-3] ${target.name} has no serious or critical axe violations at ${width}px (${scheme})`, async ({
          page,
        }) => {
          await signInAs(page, target.account);
          await openPage(page, target.path, width);
          expect(await seriousAxeViolations(page)).toEqual([]);
        });

        test(`[UX-4] ${target.name} passes the style audit at ${width}px (${scheme})`, async ({ page }) => {
          await signInAs(page, target.account);
          await openPage(page, target.path, width);
          expect(await auditStyles(page, scheme)).toEqual([]);
        });
      }
    }

    test(`[UX-3] the open More sheet has no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await signInAs(page, 'senior');
      await openPage(page, '/queue', 360);
      await page.getByRole('button', { name: 'More' }).click();
      await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
      expect(await seriousAxeViolations(page)).toEqual([]);
    });

    test(`[UX-3] the open account menu has no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await signInAs(page, 'admin');
      await openPage(page, '/policy', 1280);
      await page.getByRole('button', { name: /^Account: / }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      expect(await seriousAxeViolations(page)).toEqual([]);
    });
  });
}

for (const target of PAGES) {
  test(`[UX-2] ${target.name} has no horizontal scroll from 320 to 1920 px`, async ({ page }) => {
    await signInAs(page, target.account);
    await openPage(page, target.path, 1280);
    for (const width of [320, 360, 600, 840, 1200, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await horizontalOverflow(page), `${width}px`).toBe(0);
    }
  });
}

const VARIANTS: Array<[number, 'bar' | 'rail' | 'drawer']> = [
  [360, 'bar'],
  [599, 'bar'],
  [600, 'rail'],
  [700, 'rail'],
  [1000, 'rail'],
  [1199, 'rail'],
  [1200, 'drawer'],
  [1300, 'drawer'],
];

test.describe('navigation variant by width', () => {
  for (const [width, variant] of VARIANTS) {
    test(`[UX-2] at ${width}px only the navigation ${variant} is shown`, async ({ page }) => {
      await signInAs(page, 'senior');
      await openPage(page, '/queue', width);
      for (const other of ['bar', 'rail', 'drawer'] as const) {
        const locator = page.locator(`[data-nav="${other}"]`);
        if (other === variant) await expect(locator).toBeVisible();
        else await expect(locator).toBeHidden();
      }
      await expect(page.getByRole('navigation')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    });
  }

  test('[UX-2] the bar shows the More destinations for the role in a sheet', async ({ page }) => {
    await signInAs(page, 'senior');
    await openPage(page, '/queue', 360);
    await page.getByRole('button', { name: 'More' }).click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet.getByRole('link')).toHaveText(['Policy', 'Metrics', 'Status']);
    await sheet.getByRole('link', { name: 'Metrics' }).click();
    await expect(page).toHaveURL(/\/metrics$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Metrics');
  });

  // docs/05-test-plan.md sec. 6 (target size): navigation items >= 40 high, with the 48 px hit area where M3
  // specifies it. That is the touch bar (360 px); the pointer-width drawer uses compact 40 px rows (03 sec. 3.1).
  test('[UX-3] navigation targets: bar items at least 48 px high, drawer rows at least 40 px, all 40 px wide', async ({
    page,
  }) => {
    await signInAs(page, 'senior');
    for (const [width, minHeight] of [
      [360, 48],
      [1280, 40],
    ] as const) {
      await openPage(page, '/queue', width);
      const nav = page.getByRole('navigation');
      for (const item of await nav.locator('a, button').all()) {
        const box = await item.boundingBox();
        expect(box, `${width}px`).not.toBeNull();
        expect(box?.height ?? 0, `${width}px ${await item.textContent()}`).toBeGreaterThanOrEqual(minHeight);
        expect(box?.width ?? 0, `${width}px ${await item.textContent()}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

test.describe('keyboard', () => {
  test('[UX-3] the skip link is the first stop and moves focus to the main content', async ({ page }) => {
    await signInAs(page, 'moderator');
    await openPage(page, '/queue', 1300);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#content')).toBeFocused();
  });

  for (const [width, variant] of [
    [360, 'bar'],
    [800, 'rail'],
    [1300, 'drawer'],
  ] as const) {
    test(`[UX-3] Tab reaches every ${variant} item with a visible focus ring`, async ({ page }) => {
      await signInAs(page, 'senior');
      await openPage(page, '/queue', width);
      const items = page.locator(`[data-nav="${variant}"]`).locator('a, button');
      const expected = (await items.allTextContents()).map((text) => text.trim());
      const reached = new Set<string>();
      for (let i = 0; i < 40 && reached.size < expected.length; i += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate((selector) => {
          const el = document.activeElement;
          if (!el || !el.closest(selector)) return null;
          const style = getComputedStyle(el);
          return {
            text: (el.textContent ?? '').trim(),
            outline: parseFloat(style.outlineWidth),
            outlineStyle: style.outlineStyle,
          };
        }, `[data-nav="${variant}"]`);
        if (!focused) continue;
        expect(focused.outlineStyle, focused.text).not.toBe('none');
        expect(focused.outline, focused.text).toBeGreaterThanOrEqual(2);
        reached.add(focused.text);
      }
      expect([...reached].sort()).toEqual([...expected].sort());
    });
  }

  test('[UX-3] Esc closes the More sheet and focus returns to More', async ({ page }) => {
    await signInAs(page, 'author');
    await openPage(page, '/feed', 360);
    const more = page.getByRole('button', { name: 'More' });
    await more.click();
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('themes and motion', () => {
  test('[UX-4] with no stored choice the system dark scheme applies the dark tokens', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signInAs(page, 'author');
    await openPage(page, '/feed', 1280);
    expect(await bodyBackground(page)).toBe(rgb(tokens.dark.canvas));
  });

  test('[UX-4] the theme toggle overrides the system scheme and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await signInAs(page, 'author');
    await openPage(page, '/feed', 1280);
    expect(await bodyBackground(page)).toBe(rgb(tokens.light.canvas));
    const drawer = page.locator('[data-nav="drawer"]');
    await drawer.getByRole('button', { name: 'Theme: System' }).click();
    await drawer.getByRole('button', { name: 'Theme: Light' }).click();
    await expect(drawer.getByRole('button', { name: 'Theme: Dark' })).toBeVisible();
    await expect.poll(() => bodyBackground(page)).toBe(rgb(tokens.dark.canvas));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await bodyBackground(page)).toBe(rgb(tokens.dark.canvas));
    await expect(drawer.getByRole('button', { name: 'Theme: Dark' })).toBeVisible();
  });

  test('[UX-3] with reduced motion no animation runs after load', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAs(page, 'moderator');
    await openPage(page, '/queue', 1280);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe('access and demo users', () => {
  test('[SEC-1] an author opening the queue sees the 403 view inside the shell', async ({ page }) => {
    await signInAs(page, 'author');
    await openPage(page, '/queue', 1280);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("You don't have access to this");
    await expect(page.getByRole('link', { name: 'Go to Feed' })).toHaveAttribute('href', '/feed');
    await expect(page.locator('[data-nav="drawer"]')).toBeVisible();
  });

  test('[UX-5] "Switch demo user" changes role without visiting the sign-in page', async ({ page }) => {
    await signInAs(page, 'author');
    await openPage(page, '/feed', 1280);
    await page.getByRole('button', { name: 'Account: Asha Rao, Author' }).click();
    await page.getByRole('menuitem', { name: 'Switch demo user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Switch demo user' });
    await dialog.getByRole('button', { name: /Moderator - Chen Wei/ }).click();
    await expect(page).toHaveURL(/\/queue$/);
    await expect(page.getByRole('button', { name: 'Account: Chen Wei, Moderator' })).toBeVisible();
    await expect(page.locator('[data-nav="drawer"]').getByRole('link').first()).toHaveText('Queue');
  });

  test('[SEC-1] signing out returns to sign-in, and app pages then need a session again', async ({ page }) => {
    await signInAs(page, 'admin');
    await openPage(page, '/policy', 1280);
    await page.getByRole('button', { name: 'Account: Femi Adeyemi, Admin' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/policy');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fpolicy$/);
  });
});
