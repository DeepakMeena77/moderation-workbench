import { describe, expect, it } from 'vitest';
import { tokens, type M3Palette, type SchemeName } from '@/ui/theme/tokens';

// docs/05-test-plan.md sec. 6.1: every text pair >= 4.5:1, every meaningful non-text indicator >= 3:1, in
// both themes. It runs from the first token commit, so an inaccessible colour can never land.

type Role = keyof M3Palette;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!match) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part ?? '0', 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXT_PAIRS: Array<[Role, Role]> = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'],
  ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'],
  ['onErrorContainer', 'errorContainer'],
  ['onSuccess', 'success'],
  ['onSuccessContainer', 'successContainer'],
  ['onWarning', 'warning'],
  ['onWarningContainer', 'warningContainer'],
  ['inverseOnSurface', 'inverseSurface'],
  ...(['canvas', 'card', 'cardNested', 'field'] as const).flatMap((surface): Array<[Role, Role]> => [
    ['onSurface', surface],
    ['onSurfaceVariant', surface],
  ]),
];

const NON_TEXT_PAIRS: Array<[Role, Role, string]> = [
  ['secondary', 'canvas', 'focus ring'],
  ['secondary', 'card', 'focus ring'],
  ['onSurfaceVariant', 'field', 'text-field active indicator'],
  ['fieldBorder', 'field', 'text-field and search border'],
  ['fieldBorder', 'canvas', 'search border on the page'],
  ['success', 'cardNested', 'confidence bar'],
  ['primary', 'cardNested', 'confidence bar'],
  ['warning', 'cardNested', 'confidence bar'],
  ['error', 'cardNested', 'confidence bar'],
];

describe.each(['light', 'dark'] as SchemeName[])('%s theme tokens', (scheme) => {
  const t = tokens[scheme];

  it.each(TEXT_PAIRS)(`[UX-3] text ${scheme}: %s on %s is at least 4.5:1`, (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)(`[UX-3] non-text ${scheme}: %s on %s (%s) is at least 3:1`, (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});
