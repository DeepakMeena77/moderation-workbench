import { createTheme, type PaletteOptions, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import { layout, MONO_FAMILY } from './layout';
import { tokens, type M3Palette } from './tokens';

export { layout, MONO_FAMILY, pageSx, titleGap } from './layout';

// The MUI theme for the design in docs/03-ui-ux.md: neutral surfaces with 1 px hairlines, one blue accent, no
// elevation, no gradients. Components read colours through the generated CSS variables (theme.vars.palette.m3.*),
// so light and dark switch without a re-render.

declare module '@mui/material/styles' {
  interface Palette {
    m3: M3Palette;
  }
  interface PaletteOptions {
    m3?: M3Palette;
  }
  interface TypographyVariants {
    display: CSSProperties;
  }
  interface TypographyVariantsOptions {
    display?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    display: true;
  }
}

function paletteFrom(t: M3Palette): PaletteOptions {
  return {
    primary: { main: t.primary, contrastText: t.onPrimary },
    secondary: { main: t.secondary, contrastText: t.onSecondary },
    error: { main: t.error, contrastText: t.onError },
    warning: { main: t.warning, contrastText: t.onWarning },
    success: { main: t.success, contrastText: t.onSuccess },
    info: { main: t.primary, contrastText: t.onPrimary },
    background: { default: t.canvas, paper: t.card },
    text: { primary: t.onSurface, secondary: t.onSurfaceVariant },
    divider: t.border,
    m3: t,
  };
}

/** The palette as CSS variables when available (always, with cssVariables on). */
export function m3(theme: Theme): M3Palette {
  return (theme.vars ?? theme).palette.m3;
}

/** A flat hover or pressed layer: the content colour mixed into the background, never a gradient. */
export function layer(content: string, background: string, percent = 6): string {
  return `color-mix(in srgb, ${content} ${percent}%, ${background})`;
}

// Type scale (sec. 2.3). Sizes and line heights are in rem so browser zoom and font settings apply.
// The return type is inferred: MUI's typography options take its own CSSProperties, not React's.
const type = (size: number, lineHeight: number, weight: 400 | 500) => ({
  fontSize: `${size / 16}rem`,
  lineHeight: `${lineHeight / 16}rem`,
  fontWeight: weight,
  letterSpacing: 0,
});

const pageTitle = type(20, 28, 500);
const sectionTitle = type(15, 22, 500);
const strong = type(14, 20, 500);
const body = type(14, 20, 400);
const meta = type(12, 16, 400);
const label = type(12, 16, 500);
const statValue = type(28, 36, 500);

export const FOCUS_RING_WIDTH = 2;
export const FOCUS_RING_OFFSET = 2;

/** Mono text for IDs, clause codes and request IDs (sec. 2.3): small, neutral, from the system stack. */
export const monoSx = { fontFamily: MONO_FAMILY, fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 400 } as const;

const COMPACT = '@media (max-width: 599.95px)';

/**
 * On phones, controls smaller than 44 px get an invisible extension of their hit area (sec. 5), so the visual size
 * stays compact while the touch target meets the minimum.
 */
const touchTarget = {
  [COMPACT]: {
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      height: layout.touchTarget,
      transform: 'translateY(-50%)',
    },
  },
} as const;

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: paletteFrom(tokens.light) },
    dark: { palette: paletteFrom(tokens.dark) },
  },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: layout.controlRadius },
  spacing: 4, // 1 unit = 4 px; scripts/check-ui-rules.mjs relies on it
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: pageTitle,
    h2: sectionTitle,
    h3: sectionTitle,
    h4: strong,
    h5: strong,
    h6: strong,
    subtitle1: strong,
    subtitle2: strong,
    body1: body,
    body2: body,
    caption: meta,
    button: { ...strong, textTransform: 'none' },
    overline: { ...label, textTransform: 'none' },
    display: { ...statValue, fontVariantNumeric: 'tabular-nums' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: { backgroundColor: m3(theme).canvas, color: m3(theme).onSurface },
        '*:focus-visible': {
          outline: `${FOCUS_RING_WIDTH}px solid ${m3(theme).secondary}`,
          outlineOffset: FOCUS_RING_OFFSET,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animation: 'none !important', transition: 'none !important' },
        },
      }),
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': {
            outline: `${FOCUS_RING_WIDTH}px solid ${m3(theme).secondary}`,
            outlineOffset: FOCUS_RING_OFFSET,
          },
        }),
      },
    },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: layout.cardRadius,
          background: m3(theme).card,
          border: `1px solid ${m3(theme).border}`,
        }),
      },
    },
    // Buttons (sec. 4): 32 high (36 for the main action, size="large"), radius 6, 16 px icons. Variant colours are
    // set by src/ui/components/Button.tsx.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: layout.controlRadius,
          height: layout.buttonHeight,
          minWidth: 0,
          paddingBlock: 0,
          paddingInline: 12,
          boxShadow: 'none',
          whiteSpace: 'nowrap',
          '&:has(.MuiButton-startIcon)': { paddingInlineStart: 8 },
          '& .MuiButton-startIcon': { marginLeft: 0, marginRight: 6 },
          '& .MuiButton-endIcon': { marginLeft: 4, marginRight: -2 },
          '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 16 },
          ...touchTarget,
        },
        // MUI's large size sets 15 px text; the main action keeps the 14/20 button style.
        sizeLarge: { ...strong, height: layout.buttonHeightLarge, paddingInline: 16 },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: layout.controlRadius, ...touchTarget } },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: layout.controlRadius, height: layout.chipHeight } } },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    // Dialog and Drawer pass their own elevation (24 and 16) to the paper, which wins over MuiPaper's default,
    // so both are set to 0 here: sheets and dialogs are separated by a hairline and the scrim, never by a shadow.
    MuiDrawer: { defaultProps: { elevation: 0 }, styleOverrides: { paper: { border: 0 } } },
    MuiDialog: {
      defaultProps: { slotProps: { paper: { elevation: 0 } } },
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: layout.cardRadius,
          boxShadow: 'none',
          backgroundColor: m3(theme).card,
          border: `1px solid ${m3(theme).border}`,
        }),
      },
    },
    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: layout.cardRadius,
          backgroundColor: m3(theme).card,
          border: `1px solid ${m3(theme).border}`,
        }),
        list: { paddingBlock: 4 },
      },
    },
    MuiMenuItem: { styleOverrides: { root: { ...body, minHeight: 32 } } },
    MuiPopover: { defaultProps: { elevation: 0 } },
    // Fields (sec. 4): the label sits above the field, never inside the border; inputs are 36 high with a 6 px radius
    // and a 1 px border that darkens on hover and turns accent on focus.
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: {
        root: ({ theme }) => ({
          ...label,
          position: 'relative',
          transform: 'none',
          maxWidth: '100%',
          marginBottom: 4,
          color: m3(theme).onSurfaceVariant,
          '&.Mui-focused': { color: m3(theme).onSurfaceVariant },
          '&.Mui-error': { color: m3(theme).error },
          '&.Mui-disabled': { color: m3(theme).textTertiary },
        }),
      },
    },
    MuiInputBase: { styleOverrides: { root: { ...body } } },
    MuiOutlinedInput: {
      defaultProps: { notched: false },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: layout.fieldRadius,
          backgroundColor: m3(theme).field,
          '& .MuiOutlinedInput-notchedOutline': {
            top: 0,
            borderColor: m3(theme).fieldBorder,
            '& legend': { display: 'none' },
          },
          '&:hover:not(.Mui-disabled, .Mui-error, .Mui-focused) .MuiOutlinedInput-notchedOutline': {
            borderColor: m3(theme).fieldBorderHover,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: m3(theme).primary, borderWidth: 1 },
          '&.Mui-focused': {
            outline: `2px solid color-mix(in srgb, ${m3(theme).primary} 30%, transparent)`,
            outlineOffset: 0,
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: m3(theme).error },
          '&.MuiInputBase-multiline': { padding: '8px 12px' },
          // The field itself shows focus; the inner input does not draw a second ring.
          '& .MuiInputBase-input:focus-visible': { outline: 'none' },
        }),
        input: {
          padding: '8px 12px',
          height: '1.25rem',
          '&.MuiInputBase-inputMultiline': { padding: 0, height: 'auto' },
        },
      },
    },
    MuiSelect: { styleOverrides: { select: { minHeight: 0 } } },
    MuiFormHelperText: {
      styleOverrides: {
        root: ({ theme }) => ({
          ...meta,
          marginInline: 0,
          marginTop: 4,
          color: m3(theme).onSurfaceVariant,
          '&.Mui-error': { color: m3(theme).error },
        }),
      },
    },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(0, 0, 0, 0.4)' } } },
    },
    // MUI's tooltip text is 11/14 px, off the type scale; tooltips use the 12/16 meta style.
    MuiTooltip: { styleOverrides: { tooltip: { ...meta } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme }) => ({ height: 4, borderRadius: 2, backgroundColor: m3(theme).surfaceContainerHigh }),
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: ({ theme }) => ({ backgroundColor: m3(theme).surfaceContainer }),
      },
    },
  },
});
