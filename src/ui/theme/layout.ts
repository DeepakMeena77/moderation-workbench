// Shape, size and spacing constants (docs/03-ui-ux.md sec. 2.4 and sec. 5). Spacing values are theme units
// (1 = 4 px); radii and heights are px. No imports, so the UI tests can read them without the theme.

export const layout = {
  /** Cards, panels, dialogs, menus. */
  cardRadius: 8,
  /** Nested sections, banners, inputs, buttons, filter chips. */
  controlRadius: 6,
  /** Badges. */
  badgeRadius: 4,
  /** Kept for callers that size nested sections; the same as controlRadius. */
  nestedRadius: 6,
  fieldRadius: 6,
  /** Card padding: 12 on phones, 16 from 840 px. */
  cardPadding: { xs: 3, md: 4 },
  /** Gap between stacked cards and between page sections. */
  stackGap: 3,
  appBarHeight: 56,
  buttonHeight: 32,
  /** The main action of a page (Post, Sign in, Approve, Resolve appeal, Validate, Publish). */
  buttonHeightLarge: 36,
  /** Minimum touch target on phones; padding (an invisible extension) makes it up around smaller controls. */
  touchTarget: 44,
  chipHeight: 28,
  badgeHeight: 20,
  searchHeight: 36,
  drawerWidth: 240,
  drawerItemHeight: 32,
  /** Reading pages (feed, my content, history) and form pages (policy) start next to the navigation. */
  readingWidth: 760,
  formWidth: 960,
  workWidth: 1600,
} as const;

/** The padding of every signed-in page: 16 / 24 at the sides and above the heading. */
export const pageSx = { px: { xs: 4, sm: 6 }, pt: { xs: 4, sm: 6 }, pb: 8 } as const;

/** Space between the page heading and the first panel. */
export const titleGap = { xs: 3, sm: 4 } as const;

/** System monospace for IDs, clause codes and request IDs: small and neutral. */
export const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
