import type { Page } from '@playwright/test';
import { tokens, type SchemeName } from '../../../src/ui/theme/tokens';

// Style audit (docs/05-test-plan.md sec. 6.4): reads computed styles of visible elements and checks the
// "no elevation, tonal cards, pill buttons" rules. Shape and colour checks apply to our own components,
// which mark their root with data-ui, so MUI internals are not judged.

export interface StyleViolation {
  rule: string;
  element: string;
  detail: string;
}

// M3 font-size / line-height pairs in px.
const TYPE_SCALE: Array<[number, number]> = [
  [11, 16],
  [12, 16],
  [14, 20],
  [16, 24],
  [22, 28],
  [24, 32],
  [28, 36],
  [32, 40],
  [36, 44],
];

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export async function auditStyles(page: Page, scheme: SchemeName): Promise<StyleViolation[]> {
  const t = tokens[scheme];
  const cardRgb = hexToRgb(t.card);
  const surfaceRgbs = [t.canvas, t.card, t.cardNested, t.field, t.selected].map(hexToRgb);

  return page.evaluate(
    ({ cardRgb, surfaceRgbs, typeScale }) => {
      const out: Array<{ rule: string; element: string; detail: string }> = [];
      const describe = (el: Element): string => {
        const ui = el.getAttribute('data-ui');
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2) : [];
        return `${el.tagName.toLowerCase()}${ui ? `[data-ui=${ui}]` : ''}${cls.length ? `.${cls.join('.')}` : ''}`;
      };
      const px = (value: string): number => parseFloat(value);
      const transparent = (value: string) => value === 'transparent' || value === 'rgba(0, 0, 0, 0)';

      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;

        if (cs.boxShadow !== 'none') out.push({ rule: 'elevation', element: describe(el), detail: cs.boxShadow });

        const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (hasOwnText) {
          const size = px(cs.fontSize);
          const lineHeight = px(cs.lineHeight);
          const inScale = typeScale.some(([s, l]) => Math.abs(s - size) < 0.5 && Math.abs(l - lineHeight) < 0.5);
          if (!inScale)
            out.push({ rule: 'type-scale', element: describe(el), detail: `${cs.fontSize}/${cs.lineHeight}` });
          // next/font names the face "__Roboto_<hash>", so the first family must contain "Roboto".
          const firstFamily = cs.fontFamily.split(',')[0] ?? '';
          if (!/roboto/i.test(firstFamily)) out.push({ rule: 'font', element: describe(el), detail: cs.fontFamily });
        }

        const ui = el.getAttribute('data-ui');
        if (!ui) continue;

        for (const prop of [
          'paddingTop',
          'paddingRight',
          'paddingBottom',
          'paddingLeft',
          'marginTop',
          'marginRight',
          'marginBottom',
          'marginLeft',
          'rowGap',
          'columnGap',
        ] as const) {
          const raw = cs[prop];
          if (raw === 'normal' || raw === 'auto' || raw === '') continue;
          const value = px(raw);
          if (Number.isFinite(value) && Math.abs(value % 4) > 0.01) {
            out.push({ rule: 'spacing', element: describe(el), detail: `${prop} ${raw}` });
          }
        }

        const height = rect.height;
        const radius = px(cs.borderTopLeftRadius);
        if (ui === 'card') {
          const borders = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
          if (borders.some((w) => px(w) !== 0))
            out.push({ rule: 'card-border', element: describe(el), detail: borders.join(' ') });
          if (cs.backgroundColor !== cardRgb)
            out.push({ rule: 'card-colour', element: describe(el), detail: cs.backgroundColor });
        }
        if (
          ['card', 'section', 'stack'].includes(ui) &&
          !transparent(cs.backgroundColor) &&
          !surfaceRgbs.includes(cs.backgroundColor)
        ) {
          out.push({ rule: 'surface-colour', element: describe(el), detail: cs.backgroundColor });
        }
        if (ui === 'button') {
          if (Math.abs(height - 40) > 0.5)
            out.push({ rule: 'button-height', element: describe(el), detail: `${height}px` });
          if (radius < height / 2)
            out.push({ rule: 'button-shape', element: describe(el), detail: `radius ${radius}px` });
        }
        if (ui === 'chip' && (Math.abs(height - 32) > 0.5 || Math.abs(radius - 8) > 0.5)) {
          out.push({ rule: 'chip-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
        if (ui === 'tag' && (Math.abs(height - 24) > 0.5 || Math.abs(radius - 6) > 0.5)) {
          out.push({ rule: 'tag-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
        if (ui === 'search' && (Math.abs(height - 56) > 0.5 || radius < height / 2)) {
          out.push({ rule: 'search-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
      }
      return out;
    },
    { cardRgb, surfaceRgbs, typeScale: TYPE_SCALE },
  );
}
