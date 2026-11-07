// Material 3 colour tokens, copied exactly from docs/03-ui-ux.md sec. 2.1 (Tonal Spot, seed #4A5FC1), plus
// the surface roles from sec. 2.2. This is the only file in src/ allowed to contain hex colours.

const lightScheme = {
  primary: '#505B92',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DDE1FF',
  onPrimaryContainer: '#384379',
  secondary: '#5A5D72',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#DFE1F9',
  onSecondaryContainer: '#434659',
  tertiary: '#76546E',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD7F2',
  onTertiaryContainer: '#5C3C55',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#93000A',
  success: '#006D43',
  onSuccess: '#FFFFFF',
  successContainer: '#92F7BC',
  onSuccessContainer: '#002111',
  warning: '#974806',
  onWarning: '#FFFFFF',
  warningContainer: '#FFDBC8',
  onWarningContainer: '#321300',
  surface: '#FBF8FF',
  onSurface: '#1B1B21',
  onSurfaceVariant: '#45464F',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F5F2FA',
  surfaceContainer: '#EFEDF4',
  surfaceContainerHigh: '#E9E7EF',
  surfaceContainerHighest: '#E3E1E9',
  outline: '#767680',
  outlineVariant: '#C6C5D0',
  inverseSurface: '#303036',
  inverseOnSurface: '#F2F0F7',
};

export type M3Scheme = typeof lightScheme;

const darkScheme: M3Scheme = {
  primary: '#B9C3FF',
  onPrimary: '#212C61',
  primaryContainer: '#384379',
  onPrimaryContainer: '#DDE1FF',
  secondary: '#C3C5DD',
  onSecondary: '#2C2F42',
  secondaryContainer: '#434659',
  onSecondaryContainer: '#DFE1F9',
  tertiary: '#E5BAD8',
  onTertiary: '#44263E',
  tertiaryContainer: '#5C3C55',
  onTertiaryContainer: '#FFD7F2',
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  success: '#76DAA1',
  onSuccess: '#003920',
  successContainer: '#005231',
  onSuccessContainer: '#92F7BC',
  warning: '#FFB68A',
  onWarning: '#522300',
  warningContainer: '#743400',
  onWarningContainer: '#FFDBC8',
  surface: '#121318',
  onSurface: '#E3E1E9',
  onSurfaceVariant: '#C6C5D0',
  surfaceContainerLowest: '#0D0E13',
  surfaceContainerLow: '#1B1B21',
  surfaceContainer: '#1F1F25',
  surfaceContainerHigh: '#292A2F',
  surfaceContainerHighest: '#34343A',
  outline: '#90909A',
  outlineVariant: '#45464F',
  inverseSurface: '#E3E1E9',
  inverseOnSurface: '#303036',
};

export interface SurfaceRoles {
  canvas: string;
  card: string;
  cardNested: string;
  field: string;
  selected: string;
  scrim: string;
}

export type M3Palette = M3Scheme & SurfaceRoles;

const SCRIM = 'rgba(0, 0, 0, 0.32)';

export const tokens: Record<'light' | 'dark', M3Palette> = {
  light: {
    ...lightScheme,
    canvas: lightScheme.surfaceContainer,
    card: lightScheme.surfaceContainerLowest,
    cardNested: lightScheme.surfaceContainerLow,
    field: lightScheme.surfaceContainerHighest,
    selected: lightScheme.secondaryContainer,
    scrim: SCRIM,
  },
  dark: {
    ...darkScheme,
    canvas: darkScheme.surface,
    card: darkScheme.surfaceContainer,
    cardNested: darkScheme.surfaceContainerHigh,
    field: darkScheme.surfaceContainerHighest,
    selected: darkScheme.secondaryContainer,
    scrim: SCRIM,
  },
};

export type SchemeName = keyof typeof tokens;
