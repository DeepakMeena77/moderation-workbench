import { createTheme, type PaletteOptions, type Theme } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import { tokens, type M3Palette } from './tokens';

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

const headlineSmall = type(24, 32, 400);
const titleLarge = type(22, 28, 400);
const titleMedium = type(16, 24, 500);
const titleSmall = type(14, 20, 500);
const bodyLarge = type(16, 24, 400);
const bodyMedium = type(14, 20, 400);
const bodySmall = type(12, 16, 400);
const labelLarge = type(14, 20, 500);
const labelMedium = type(12, 16, 500);
const displaySmall = type(36, 44, 400);

export const FOCUS_RING_WIDTH = 3;
export const FOCUS_RING_OFFSET = 2;

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: paletteFrom(tokens.light) },
    dark: { palette: paletteFrom(tokens.dark) },
  },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: 12 },
  spacing: 4, // 1 unit = 4 px (M3 4 dp grid); scripts/check-ui-rules.mjs relies on it
  typography: {
    fontFamily: 'var(--font-roboto), Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: headlineSmall,
    h2: titleLarge,
    h3: titleMedium,
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
    display: displaySmall,
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
      styleOverrides: { root: ({ theme }) => ({ borderRadius: 12, background: m3(theme).card }) },
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
      styleOverrides: { paper: { borderRadius: 28, boxShadow: 'none' } },
    },
    MuiTextField: { defaultProps: { variant: 'filled' } },
    // MUI sets input and label line heights to 1.4375em (23 px); M3 bodyLarge is 16/24.
    MuiInputBase: { styleOverrides: { root: { lineHeight: '1.5rem' } } },
    MuiInputLabel: { styleOverrides: { root: { lineHeight: '1.5rem' } } },
    // 03 sec. 2.2: the scrim behind dialogs, sheets and the modal drawer is black at 32%.
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(0, 0, 0, 0.32)' } } },
    },
    MuiMenu: { defaultProps: { elevation: 0 } },
    MuiPopover: { defaultProps: { elevation: 0 } },
    MuiSkeleton: {
      styleOverrides: {
        root: ({ theme }) => ({ backgroundColor: m3(theme).surfaceContainerHigh }),
      },
    },
  },
});
