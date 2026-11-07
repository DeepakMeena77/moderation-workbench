// Shape, size and spacing constants of the layout (docs/03-ui-ux.md sec. 2.5 and sec. 5). Spacing values are
// theme units (1 = 4 px); radii and heights are px. No imports, so the UI tests can read them without the theme.

export const layout = {
  cardRadius: 8,
  nestedRadius: 4,
  fieldRadius: 8,
  /** Card padding: 12 on compact, 16 from 840 px. */
  cardPadding: { xs: 3, md: 4 },
  /** Gap between cards and between the sections of a page. */
  stackGap: 3,
  appBarHeight: 64,
  searchHeight: 40,
  drawerWidth: 256,
  drawerItemHeight: 40,
  /** Reading pages (feed, my content, history) and form pages (policy) start next to the navigation. */
  readingWidth: 840,
  formWidth: 960,
  workWidth: 1600,
} as const;

/** The padding of every signed-in page: 16 / 24 at the sides, the heading close under the app bar. */
export const pageSx = { px: { xs: 4, sm: 6 }, pt: { xs: 3, sm: 4 }, pb: 6 } as const;

/** Space between the page heading and the first card. */
export const titleGap = { xs: 3, sm: 4 } as const;
