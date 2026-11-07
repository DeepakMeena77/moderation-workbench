// Colour tokens (docs/03-ui-ux.md sec. 2.1 and sec. 2.2). This is the only file in src/ allowed to contain hex
// colours. Neutrals do the work; one blue accent; red, amber, green and blue only where they carry meaning. The role
// names (primary, secondaryContainer, ...) are the keys MUI and the components read; sec. 2.1 says what each is for.

const lightScheme = {
  // The one accent: primary buttons, links, focus rings, the selected navigation marker.
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  // Info: soft blue badge and banner.
  primaryContainer: '#EFF6FF',
  onPrimaryContainer: '#1D4ED8',
  // Focus ring.
  secondary: '#2563EB',
  onSecondary: '#FFFFFF',
  // Selected: a neutral grey fill with the darkest text.
  secondaryContainer: '#F4F4F5',
  onSecondaryContainer: '#18181B',
  // Neutral badge.
  tertiary: '#52525B',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#F4F4F5',
  onTertiaryContainer: '#3F3F46',
  error: '#DC2626',
  onError: '#FFFFFF',
  errorContainer: '#FEF2F2',
  onErrorContainer: '#B91C1C',
  success: '#15803D',
  onSuccess: '#FFFFFF',
  successContainer: '#F0FDF4',
  onSuccessContainer: '#166534',
  warning: '#B45309',
  onWarning: '#FFFFFF',
  warningContainer: '#FFFBEB',
  onWarningContainer: '#92400E',
  surface: '#FAFAFA',
  onSurface: '#18181B',
  onSurfaceVariant: '#52525B',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#FAFAFA',
  surfaceContainer: '#F4F4F5',
  surfaceContainerHigh: '#E4E4E7',
  surfaceContainerHighest: '#D4D4D8',
  // Input border (outline) and hairline (outlineVariant).
  outline: '#D4D4D8',
  outlineVariant: '#E4E4E7',
  inverseSurface: '#18181B',
  inverseOnSurface: '#FAFAFA',
};

export type M3Scheme = typeof lightScheme;

const darkScheme: M3Scheme = {
  primary: '#60A5FA',
  onPrimary: '#0B0B0C',
  primaryContainer: '#111D33',
  onPrimaryContainer: '#93C5FD',
  secondary: '#60A5FA',
  onSecondary: '#0B0B0C',
  secondaryContainer: '#27272A',
  onSecondaryContainer: '#FAFAFA',
  tertiary: '#A1A1AA',
  onTertiary: '#0B0B0C',
  tertiaryContainer: '#27272A',
  onTertiaryContainer: '#D4D4D8',
  error: '#F87171',
  onError: '#0B0B0C',
  errorContainer: '#2A1416',
  onErrorContainer: '#FCA5A5',
  success: '#4ADE80',
  onSuccess: '#0B0B0C',
  successContainer: '#10261A',
  onSuccessContainer: '#86EFAC',
  warning: '#FBBF24',
  onWarning: '#0B0B0C',
  warningContainer: '#2A2010',
  onWarningContainer: '#FCD34D',
  surface: '#0B0B0C',
  onSurface: '#FAFAFA',
  onSurfaceVariant: '#A1A1AA',
  surfaceContainerLowest: '#141416',
  surfaceContainerLow: '#18181B',
  surfaceContainer: '#1C1C1F',
  surfaceContainerHigh: '#27272A',
  surfaceContainerHighest: '#3F3F46',
  outline: '#3F3F46',
  outlineVariant: '#27272A',
  inverseSurface: '#FAFAFA',
  inverseOnSurface: '#18181B',
};

export interface SurfaceRoles {
  /** Page background. */
  canvas: string;
  /** Sidebar, top bar and bottom bar. */
  chrome: string;
  /** Cards, panels, dialogs, menus, list regions. */
  card: string;
  /** Sections inside a card (findings, nested notes). */
  cardNested: string;
  /** Input and search-bar background. */
  field: string;
  /** Selected row, selected navigation item, selected filter. */
  selected: string;
  /** The 1 px hairline on cards, panels and between rows. */
  border: string;
  /** Borders of secondary buttons and chips at rest. */
  borderStrong: string;
  /** Borders on hover. */
  borderHover: string;
  /** Text-field and search-field borders at rest: at least 3:1 against the field (WCAG 1.4.11). */
  fieldBorder: string;
  /** Text-field and search-field borders on hover. */
  fieldBorderHover: string;
  /** Third text level: section labels, quiet meta. Only on canvas, card and chrome. */
  textTertiary: string;
  /** Borders of the soft semantic badges and banners, in the same hue as their text. */
  infoBorder: string;
  successBorder: string;
  warningBorder: string;
  errorBorder: string;
  /** Severity dots: high red, medium amber, low neutral grey. */
  dotHigh: string;
  dotMedium: string;
  dotLow: string;
  scrim: string;
}

export type M3Palette = M3Scheme & SurfaceRoles;

const SCRIM = 'rgba(0, 0, 0, 0.4)';

export const tokens: Record<'light' | 'dark', M3Palette> = {
  light: {
    ...lightScheme,
    canvas: lightScheme.surface,
    chrome: lightScheme.surfaceContainerLowest,
    card: lightScheme.surfaceContainerLowest,
    cardNested: lightScheme.surfaceContainerLow,
    field: lightScheme.surfaceContainerLowest,
    selected: lightScheme.secondaryContainer,
    border: '#E4E4E7',
    borderStrong: '#D4D4D8',
    borderHover: '#A1A1AA',
    fieldBorder: '#8E8E96',
    fieldBorderHover: '#71717A',
    textTertiary: '#71717A',
    infoBorder: '#BFDBFE',
    successBorder: '#BBF7D0',
    warningBorder: '#FDE68A',
    errorBorder: '#FECACA',
    dotHigh: '#DC2626',
    dotMedium: '#D97706',
    dotLow: '#A1A1AA',
    scrim: SCRIM,
  },
  dark: {
    ...darkScheme,
    canvas: darkScheme.surface,
    chrome: darkScheme.surfaceContainerLowest,
    card: darkScheme.surfaceContainerLowest,
    cardNested: darkScheme.surfaceContainerLow,
    field: darkScheme.surfaceContainerLowest,
    selected: darkScheme.secondaryContainer,
    border: '#27272A',
    borderStrong: '#3F3F46',
    borderHover: '#52525B',
    fieldBorder: '#6B6B74',
    fieldBorderHover: '#A1A1AA',
    textTertiary: '#8B8B94',
    infoBorder: '#1E3A6B',
    successBorder: '#14532D',
    warningBorder: '#4A3A12',
    errorBorder: '#5B1F22',
    dotHigh: '#F87171',
    dotMedium: '#FBBF24',
    dotLow: '#71717A',
    scrim: SCRIM,
  },
};

export type SchemeName = keyof typeof tokens;
