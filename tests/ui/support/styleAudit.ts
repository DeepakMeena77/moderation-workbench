import type { Page } from '@playwright/test';
import { layout } from '../../../src/ui/theme/layout';
import { tokens, type SchemeName } from '../../../src/ui/theme/tokens';

// Style audit (docs/05-test-plan.md sec. 6.4): reads computed styles of visible elements and checks the design
// rules of docs/03-ui-ux.md: no shadows, no gradients, the type scale, the system fonts, 1 px hairline borders on
// cards, and the shapes of buttons (radius 6, 32 or 36 high), filter chips (radius 6, 28 high), badges (radius 4,
// 20 high) and the search bar (radius 6, 36 high). Shape and colour checks apply to our own components, which mark
// their root with data-ui, so MUI internals are not judged.

export interface StyleViolation {
  rule: string;
  element: string;
  detail: string;
}

// Font-size / line-height pairs in px (03 sec. 2.3): meta and badges, body, section title, page title, stat value.
const TYPE_SCALE: Array<[number, number]> = [
  [12, 16],
  [14, 20],
  [15, 22],
  [20, 28],
  [28, 36],
];

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export async function auditStyles(page: Page, scheme: SchemeName): Promise<StyleViolation[]> {
  const t = tokens[scheme];
  const cardRgb = hexToRgb(t.card);
  const borderRgb = hexToRgb(t.border);
  // Surfaces a data-ui section or stack may fill with: the neutral surfaces and the soft semantic panels.
  const surfaceRgbs = [
    t.canvas,
    t.chrome,
    t.card,
    t.cardNested,
    t.field,
    t.selected,
    t.primaryContainer,
    t.successContainer,
    t.warningContainer,
    t.errorContainer,
  ].map(hexToRgb);
  const shapes = {
    control: layout.controlRadius,
    badge: layout.badgeRadius,
    buttons: [layout.buttonHeight, layout.buttonHeightLarge],
    chip: layout.chipHeight,
    tag: layout.badgeHeight,
    search: layout.searchHeight,
  };

  return page.evaluate(
    ({ cardRgb, borderRgb, surfaceRgbs, typeScale, shapes }) => {
      const out: Array<{ rule: string; element: string; detail: string }> = [];
      const describe = (el: Element): string => {
        const ui = el.getAttribute('data-ui');
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2) : [];
        return `${el.tagName.toLowerCase()}${ui ? `[data-ui=${ui}]` : ''}${cls.length ? `.${cls.join('.')}` : ''}`;
      };
      const px = (value: string): number => parseFloat(value);
      const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
      const transparent = (value: string) => value === 'transparent' || value === 'rgba(0, 0, 0, 0)';

      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;

        if (cs.boxShadow !== 'none') out.push({ rule: 'elevation', element: describe(el), detail: cs.boxShadow });
        if (/gradient\(/.test(cs.backgroundImage)) {
          out.push({ rule: 'gradient', element: describe(el), detail: cs.backgroundImage.slice(0, 80) });
        }

        const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (hasOwnText) {
          const size = px(cs.fontSize);
          const lineHeight = px(cs.lineHeight);
          const inScale = typeScale.some(([s, l]) => near(s, size) && near(l, lineHeight));
          if (!inScale)
            out.push({ rule: 'type-scale', element: describe(el), detail: `${cs.fontSize}/${cs.lineHeight}` });
          // Roboto (next/font names the face "__Roboto_<hash>"), or the system monospace for IDs and codes.
          const firstFamily = cs.fontFamily.split(',')[0] ?? '';
          if (!/roboto|ui-monospace/i.test(firstFamily))
            out.push({ rule: 'font', element: describe(el), detail: cs.fontFamily });
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
        const borders = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
        if (borders.some((w) => px(w) > 1)) {
          out.push({ rule: 'heavy-border', element: describe(el), detail: borders.join(' ') });
        }
        if (ui === 'card') {
          const hairline =
            borders.every((w) => near(px(w), 1)) &&
            [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].every(
              (c) => c === borderRgb,
            );
          if (!hairline)
            out.push({
              rule: 'card-border',
              element: describe(el),
              detail: `${borders.join(' ')} ${cs.borderTopColor}`,
            });
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
          if (!shapes.buttons.some((h) => near(height, h)))
            out.push({ rule: 'button-height', element: describe(el), detail: `${height}px` });
          if (!near(radius, shapes.control))
            out.push({ rule: 'button-shape', element: describe(el), detail: `radius ${radius}px` });
        }
        if (ui === 'chip' && (!near(height, shapes.chip) || !near(radius, shapes.control))) {
          out.push({ rule: 'chip-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
        if (ui === 'tag' && (!near(height, shapes.tag) || !near(radius, shapes.badge))) {
          out.push({ rule: 'tag-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
        if (ui === 'search' && (!near(height, shapes.search) || !near(radius, shapes.control))) {
          out.push({ rule: 'search-shape', element: describe(el), detail: `${height}px / radius ${radius}px` });
        }
      }
      return out;
    },
    { cardRgb, borderRgb, surfaceRgbs, typeScale: TYPE_SCALE, shapes },
  );
}
