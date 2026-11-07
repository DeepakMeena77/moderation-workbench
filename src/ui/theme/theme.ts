import { createTheme, type PaletteOptions, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import { layout } from './layout';
import { tokens, type M3Palette } from './tokens';

export { layout, pageSx, titleGap } from './layout';

// Material 3 theme with no elevation (docs/03-ui-ux.md sec. 2 and sec. 9). Components read colours through
// the generated CSS variables (theme.vars.palette.m3.*), so light and dark switch without a re-render.

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
    info: { main: t.secondary, contrastText: t.onSecondary },
    background: { default: t.canvas, paper: t.card },
    text: { primary: t.onSurface, secondary: t.onSurfaceVariant },
    divider: t.outlineVariant,
    m3: t,
  };
}

/** The M3 palette as CSS variables when available (always, with cssVariables on). */
export function m3(theme: Theme): M3Palette {
  return (theme.vars ?? theme).palette.m3;
}

// M3 type scale (sec. 2.4). Sizes and line heights are in rem so browser zoom and font settings apply.
// The return type is inferred: MUI's typography options take its own CSSProperties, not React's.
const type = (size: number, lineHeight: number, weight: 400 | 500) => ({
  fontSize: `${size / 16}rem`,
  lineHeight: `${lineHeight / 16}rem`,
  fontWeight: weight,
  letterSpacing: 0,
});

const headlineMedium = type(28, 36, 400);
const titleLarge = type(22, 28, 400);
const titleMedium = type(16, 24, 500);
const titleSmall = type(14, 20, 500);
const bodyLarge = type(16, 24, 400);
const bodyMedium = type(14, 20, 400);
const bodySmall = type(12, 16, 400);
const labelLarge = type(14, 20, 500);
const labelMedium = type(12, 16, 500);

export const FOCUS_RING_WIDTH = 3;
export const FOCUS_RING_OFFSET = 2;

const COMPACT = '@media (max-width: 599.95px)';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: paletteFrom(tokens.light) },
    dark: { palette: paletteFrom(tokens.dark) },
  },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: layout.cardRadius },
  spacing: 4, // 1 unit = 4 px (M3 4 dp grid); scripts/check-ui-rules.mjs relies on it
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
    // The page heading is titleLarge, and titleMedium on phones, where the app bar already names the product.
    h1: { ...titleLarge, [COMPACT]: titleMedium },
    h2: titleMedium,
    h3: titleSmall,
    h4: titleSmall,
    h5: titleSmall,
    h6: titleSmall,
    subtitle1: titleMedium,
    subtitle2: titleSmall,
    body1: bodyLarge,
    body2: bodyMedium,
    caption: bodySmall,
    button: { ...labelLarge, textTransform: 'none' },
    overline: { ...labelMedium, textTransform: 'none' },
    display: headlineMedium,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: { backgroundColor: m3(theme).canvas },
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
      styleOverrides: { root: ({ theme }) => ({ borderRadius: layout.cardRadius, background: m3(theme).card }) },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 9999,
          height: 40,
          // The fixed height centres the label, so MUI's default 6px vertical padding (off the 4 dp grid) goes.
          paddingBlock: 0,
          paddingInline: 24,
          '&:has(.MuiButton-startIcon)': { paddingInlineStart: 16 },
          boxShadow: 'none',
        },
        // M3 text buttons use 12 px side padding, so a text action lines up with the text around it.
        text: { paddingInline: 12, '&:has(.MuiButton-startIcon)': { paddingInlineStart: 12, paddingInlineEnd: 16 } },
      },
    },
    MuiFab: { styleOverrides: { root: { borderRadius: 16, boxShadow: 'none' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, height: 32 } } },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'inherit' } },
    // Dialog and Drawer pass their own elevation (24 and 16) to the paper, which wins over MuiPaper's default,
    // so both are set to 0 here: sheets and dialogs are separated by tone and the scrim, never by a shadow.
    MuiDrawer: { defaultProps: { elevation: 0 }, styleOverrides: { paper: { border: 0 } } },
    MuiDialog: {
      defaultProps: { slotProps: { paper: { elevation: 0 } } },
      styleOverrides: { paper: { borderRadius: 16, boxShadow: 'none' } },
    },
    // Outlined fields, 40 high for a single line (size small). The outline carries meaning (WCAG 1.4.11), so it
    // is the one edge the design keeps outside data tables.
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    // MUI sets input and label line heights to 1.4375em (23 px); 24 px keeps a single-line field at 40.
    MuiInputBase: { styleOverrides: { root: { lineHeight: '1.5rem' } } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: layout.fieldRadius,
          // The notch's hidden copy of the label (legend > span) is 12 px; give it the bodySmall line height too.
          '& .MuiOutlinedInput-notchedOutline': { borderColor: m3(theme).outline, '& legend': { lineHeight: '1rem' } },
          '&:hover:not(.Mui-disabled, .Mui-error, .Mui-focused) .MuiOutlinedInput-notchedOutline': {
            borderColor: m3(theme).onSurface,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: m3(theme).primary, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: m3(theme).error },
          '&.MuiInputBase-multiline': { padding: '8px 14px' },
        }),
        input: { padding: '8px 14px', '&.MuiInputBase-inputMultiline': { padding: 0 } },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          lineHeight: '1.5rem',
          color: m3(theme).onSurfaceVariant,
          '&.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 8px) scale(1)' },
          '&.Mui-focused': { color: m3(theme).primary },
          '&.Mui-error': { color: m3(theme).error },
        }),
      },
    },
    // Helper and error text start at the field's edge, in bodySmall.
    MuiFormHelperText: {
      styleOverrides: { root: ({ theme }) => ({ ...theme.typography.caption, marginInline: 0, marginTop: 4 }) },
    },
    // 03 sec. 2.2: the scrim behind dialogs, sheets and the modal drawer is black at 32%.
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(0, 0, 0, 0.32)' } } },
    },
    // MUI's tooltip text is 11/14 px, off the M3 type scale; plain tooltips use bodySmall (12/16).
    MuiTooltip: { styleOverrides: { tooltip: { ...bodySmall } } },
    MuiMenu: { defaultProps: { elevation: 0 } },
    MuiPopover: { defaultProps: { elevation: 0 } },
    MuiSkeleton: {
      styleOverrides: {
        root: ({ theme }) => ({ backgroundColor: m3(theme).surfaceContainerHigh }),
      },
    },
  },
});
