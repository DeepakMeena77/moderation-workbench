import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Shared accessibility and layout checks for every page in the UI suite (docs/05-test-plan.md sec. 6).

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface AxeFinding {
  id: string;
  impact: string | null | undefined;
  help: string;
  targets: string[];
}

/** Serious and critical axe violations; the gate is zero (sec. 6.2). */
export async function seriousAxeViolations(page: Page): Promise<AxeFinding[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }));
}

/** Pixels of horizontal overflow; 0 means no horizontal scroll (WCAG 1.4.10, sec. 6.3). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
}
