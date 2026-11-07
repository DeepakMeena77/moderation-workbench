// Material 3 colour tokens, copied exactly from docs/03-ui-ux.md sec. 2.1, plus the surface roles from sec. 2.2.
// This is the only file in src/ allowed to contain hex colours.

const lightScheme = {
  primary: '#0B57D0',
  onPrimary: '#FFFFFF',
  primaryContainer: '#C2E7FF',
  onPrimaryContainer: '#001D35',
  secondary: '#3E5F90',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#D3E3FD',
  onSecondaryContainer: '#041E49',
  tertiary: '#00696B',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#CCEBEB',
  onTertiaryContainer: '#002020',
  error: '#C5221F',
  onError: '#FFFFFF',
  errorContainer: '#FCE8E6',
  onErrorContainer: '#A50E0E',
  success: '#137333',
  onSuccess: '#FFFFFF',
  successContainer: '#E6F4EA',
  onSuccessContainer: '#0D652D',
  warning: '#9A5B00',
  onWarning: '#FFFFFF',
  warningContainer: '#FEEFC3',
  onWarningContainer: '#5C3A00',
  surface: '#F1F3F4',
  onSurface: '#1F1F1F',
  onSurfaceVariant: '#444746',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F8F9FA',
  surfaceContainer: '#F1F3F4',
  surfaceContainerHigh: '#E8EAED',
  surfaceContainerHighest: '#DADCE0',
  outline: '#747775',
  outlineVariant: '#DADCE0',
  inverseSurface: '#303030',
  inverseOnSurface: '#F2F2F2',
};

export type M3Scheme = typeof lightScheme;

const darkScheme: M3Scheme = {
  primary: '#A8C7FA',
  onPrimary: '#062E6F',
  primaryContainer: '#004A77',
  onPrimaryContainer: '#C2E7FF',
  secondary: '#A9C7F0',
  onSecondary: '#0A305F',
  secondaryContainer: '#2B3A52',
  onSecondaryContainer: '#D2E3FC',
  tertiary: '#78D9D9',
  onTertiary: '#003737',
  tertiaryContainer: '#004F50',
  onTertiaryContainer: '#A6F2F2',
  error: '#F28B82',
  onError: '#5C0C08',
  errorContainer: '#8C1D18',
  onErrorContainer: '#FCE8E6',
  success: '#81C995',
  onSuccess: '#0D3B1E',
  successContainer: '#0F5223',
  onSuccessContainer: '#CEEAD6',
  warning: '#FDD663',
  onWarning: '#3F2A00',
  warningContainer: '#5C4300',
  onWarningContainer: '#FEEFC3',
  surface: '#121314',
  onSurface: '#E3E3E3',
  onSurfaceVariant: '#C4C7C5',
  surfaceContainerLowest: '#0E0F10',
  surfaceContainerLow: '#1B1C1E',
  surfaceContainer: '#1E1F21',
  surfaceContainerHigh: '#26282B',
  surfaceContainerHighest: '#2D2F33',
  outline: '#8E918F',
  outlineVariant: '#3C4043',
  inverseSurface: '#E3E3E3',
  inverseOnSurface: '#303030',
};

export interface SurfaceRoles {
  canvas: string;
  /** Navigation (bar, rail, drawer) and the top app bar. */
  chrome: string;
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
    chrome: lightScheme.surfaceContainerLowest,
    card: lightScheme.surfaceContainerLowest,
    cardNested: lightScheme.surfaceContainer,
    field: lightScheme.surfaceContainerHigh,
    selected: lightScheme.secondaryContainer,
    scrim: SCRIM,
  },
  dark: {
    ...darkScheme,
    canvas: darkScheme.surface,
    chrome: darkScheme.surfaceContainerLow,
    card: darkScheme.surfaceContainer,
    cardNested: darkScheme.surfaceContainerHigh,
    field: darkScheme.surfaceContainerHighest,
    selected: darkScheme.secondaryContainer,
    scrim: SCRIM,
  },
};

export type SchemeName = keyof typeof tokens;
