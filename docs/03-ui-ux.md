# 03 - UI/UX and design system (Material 3, no elevation)

A **Material 3** product UI with **no shadows**: depth and grouping come from **tonal surface colours**, not
elevation or borders. The feel is a work tool used every day: white chrome (app bar and navigation) around a light
grey work area, flat white regions, lists as rows, dense but calm, quick to scan. Pill-shaped buttons, 8 dp chips,
compact tags, outlined fields, and side navigation that adapts to the screen width.

The rule for every screen: **the evidence sits next to the decision, and the AI's suggestion is always
visibly different from what a human decided.**

---

## 1. Principles

1. **Tonal, flat surfaces.** No `box-shadow` anywhere (elevation 0). Cards and regions are separated from the
   page by colour (white on a light grey canvas), not by borders. Rows inside a region are split by a 1 px tonal
   step, not by divider lines.
2. **Evidence first.** Highlighted quotes, cited clause text and confidence reasons appear next to the
   recommendation and the decision buttons.
3. **AI vs human is always visible.** AI output is labelled ("AI suggestion", "AI interpretation - not verified
   evidence"). Human outcomes are labelled with the person and time. Persistent copy: "AI recommends, humans
   decide."
4. **Uncertainty is a normal state.** "AI unavailable", "Insufficient context" and "Analysing..." are designed
   states, not errors.
5. **Every view has five states:** loading, empty, error, validation and success (see sec. 7).
6. **Plain language.** Error messages say what happened and what to do next.
7. **Left-aligned and dense.** Content starts next to the navigation with a max width; it is not centred in the
   window. Sentence-case labels, specific copy, no decorative icon on every heading, no illustrations.

---

## 2. Design tokens

### 2.1 Colour: M3 roles on a neutral grey and Google blue

Primary is the `#0B57D0` blue family. Neutrals are grey with no tint. Error, success, warning and tertiary (teal)
are custom colours chosen to sit with the blue primary. Every on-colour pair meets WCAG AA (4.5:1) in both
schemes; the selected navigation item (onSecondaryContainer on secondaryContainer) is 12.6:1 in light and 8.8:1
in dark.

| Role | Light | Dark |
| --- | --- | --- |
| primary / onPrimary | `#0B57D0` / `#FFFFFF` | `#A8C7FA` / `#062E6F` |
| primaryContainer / onPrimaryContainer | `#C2E7FF` / `#001D35` | `#004A77` / `#C2E7FF` |
| secondary / onSecondary | `#3E5F90` / `#FFFFFF` | `#A9C7F0` / `#0A305F` |
| secondaryContainer / onSecondaryContainer | `#D3E3FD` / `#041E49` | `#2B3A52` / `#D2E3FC` |
| tertiary / onTertiary | `#00696B` / `#FFFFFF` | `#78D9D9` / `#003737` |
| tertiaryContainer / onTertiaryContainer | `#CCEBEB` / `#002020` | `#004F50` / `#A6F2F2` |
| error / onError | `#C5221F` / `#FFFFFF` | `#F28B82` / `#5C0C08` |
| errorContainer / onErrorContainer | `#FCE8E6` / `#A50E0E` | `#8C1D18` / `#FCE8E6` |
| success / onSuccess | `#137333` / `#FFFFFF` | `#81C995` / `#0D3B1E` |
| successContainer / onSuccessContainer | `#E6F4EA` / `#0D652D` | `#0F5223` / `#CEEAD6` |
| warning / onWarning | `#9A5B00` / `#FFFFFF` | `#FDD663` / `#3F2A00` |
| warningContainer / onWarningContainer | `#FEEFC3` / `#5C3A00` | `#5C4300` / `#FEEFC3` |
| surface / onSurface | `#F1F3F4` / `#1F1F1F` | `#121314` / `#E3E3E3` |
| onSurfaceVariant | `#444746` | `#C4C7C5` |
| surfaceContainerLowest | `#FFFFFF` | `#0E0F10` |
| surfaceContainerLow | `#F8F9FA` | `#1B1C1E` |
| surfaceContainer | `#F1F3F4` | `#1E1F21` |
| surfaceContainerHigh | `#E8EAED` | `#26282B` |
| surfaceContainerHighest | `#DADCE0` | `#2D2F33` |
| outline / outlineVariant | `#747775` / `#DADCE0` | `#8E918F` / `#3C4043` |
| inverseSurface / inverseOnSurface | `#303030` / `#F2F2F2` | `#E3E3E3` / `#303030` |

### 2.2 Surface roles: how "no elevation, no border" works

| Semantic role | Light | Dark | Used for |
| --- | --- | --- | --- |
| `canvas` (page background) | surfaceContainer `#F1F3F4` | surface `#121314` | Body, the work area behind cards |
| `chrome` | surfaceContainerLowest `#FFFFFF` | surfaceContainerLow `#1B1C1E` | Top app bar, navigation bar, rail and drawer |
| `card` | surfaceContainerLowest `#FFFFFF` | surfaceContainer `#1E1F21` | Every card, region and pane; rows inside a region |
| `cardNested` | surfaceContainer `#F1F3F4` | surfaceContainerHigh `#26282B` | Sections inside a card (findings, AI run details, timeline items, comments, neutral banners) |
| `field` | surfaceContainerHigh `#E8EAED` | surfaceContainerHighest `#2D2F33` | Search bar fill, unselected filter chips |
| `selected` | secondaryContainer | secondaryContainer | Selected list row, active navigation item, selected chip |
| `scrim` | `#000` at 32% | `#000` at 32% | Behind dialogs, sheets and the modal drawer |

The 1 px step between rows in a region is surfaceContainerHigh showing through the gap between card-coloured rows.

**Why this works without borders.** The white card and the grey canvas differ by enough to read as separate
planes (about 1.1:1), and the white chrome frames the grey work area. WCAG does not require 3:1 for purely
decorative grouping. Where an edge **carries meaning**, we keep a visible indicator:

- **text fields** are outlined: 1 px `outline` (4.5:1 on white), `onSurface` on hover, 2 px `primary` on focus,
  `error` when invalid, which meets WCAG 1.4.11
- the **focus ring** is 3 px `secondary`, offset 2 px
- **dividers** are used only inside data tables (`outlineVariant`); rows elsewhere use the 1 px tonal step

Everything else is borderless.

### 2.3 Semantic colour mapping (always icon + text, never colour alone)

| Concept | Value | Container / content colours | Icon (Material Icons Rounded) |
| --- | --- | --- | --- |
| Severity | high | errorContainer / onErrorContainer | `report` |
| | medium | warningContainer / onWarningContainer | `warning` |
| | low | secondaryContainer / onSecondaryContainer | `info` |
| Action | remove | errorContainer | `delete` |
| | limit | warningContainer | `visibility_off` |
| | label | tertiaryContainer | `label` |
| | none | successContainer | `check_circle` |
| Case status | pending_analysis | surfaceContainerHighest | small progress ring |
| | awaiting_review | primaryContainer | `pending_actions` |
| | auto_cleared | successContainer | `task_alt` |
| | resolved | secondaryContainer | `gavel` |
| | appealed | tertiaryContainer | `forum` |
| | appeal_resolved | secondaryContainer | `verified` |
| Evidence | confirmed (AI quote verified) | primaryContainer; text highlight `primaryContainer` with a 2 px `primary` underline | `verified` |
| | rule (deterministic) | secondaryContainer; same text highlight | `rule` |
| | interpretation | tertiaryContainer; **not highlighted in the text** | `psychology` |
| AI state | unavailable | errorContainer | `cloud_off` |
| | fallback model | surfaceContainerHighest | `alt_route` |
| | insufficient context | warningContainer | `help` |
| Confidence | >= 0.9 | success | Bar plus text label |
| | 0.7-0.89 | primary | Bar plus text label |
| | 0.4-0.69 | warning | Bar plus text label |
| | < 0.4 | error | Bar plus text label |

### 2.4 Typography (M3 type scale, Roboto 400/500)

| Token | Size / line height | Weight | Used for | MUI variant |
| --- | --- | --- | --- | --- |
| titleLarge | 22 / 28 | 400 | Page title (`h1`) from 600 px | `h1` |
| titleMedium | 16 / 24 | 500 | Page title below 600 px; product name in the app bar and drawer; dialog and page-section titles | `h1` (compact), `h2`, `subtitle1` |
| titleSmall | 14 / 20 | 500 | Card titles, sub-sections, list headlines, author names | `h3`, `h4` |
| bodyLarge | 16 / 24 | 400 | **Moderated content text** (post and comment bodies, case content) | `body1` |
| bodyMedium | 14 / 20 | 400 | Default text, row headlines, drawer labels, field text | `body2` |
| bodySmall | 12 / 16 | 400 | Metadata: timestamps, supporting row text, helper text | `caption` |
| labelLarge | 14 / 20 | 500 | Buttons, chips | `button` (no uppercase) |
| labelMedium | 12 / 16 | 500 | Tags, navigation labels, drawer section headers, stepper numbers | `overline` (restyled, no uppercase) |
| headlineMedium | 28 / 36 | 400 | Stat values on metrics | custom `display` |

### 2.5 Shape, spacing, state layers, motion

- **Shape:** extra-small 4 (nested sections, banners, drawer items), small 8 (cards, regions, text fields,
  search bar, chips, menus), tags 6, large 16 (dialogs, bottom sheets, FAB), **full** (buttons, navigation
  indicators on the bar and rail, avatars). Rows inside a region have no radius; the region clips them.
- **Spacing (4 dp grid):** 4, 8, 12, 16, 24, 32. Card padding 16 (12 below 840 px). Gap between cards and between
  page sections 12. Nested section padding 12. Page padding 24 at the sides from 600 px, 16 below; 16 above the
  page heading (12 below 600 px) and 16 between the heading and the first card (12 below 600 px).
- **State layers** (`onSurface` or the content colour at this opacity): hover 8%, focus 10%, pressed 10%,
  dragged 16%. Disabled: content at 38%, container at 12%.
- **Motion:**
  - standard `cubic-bezier(0.2,0,0,1)`, 200 ms (state changes)
  - emphasised decelerate `cubic-bezier(0.05,0.7,0.1,1)`, 400 ms (entering panes and sheets)
  - emphasised accelerate `cubic-bezier(0.3,0,0.8,0.15)`, 200 ms (exit)

  `prefers-reduced-motion`: no shimmer, no slide, instant changes.
- **Icons:** Material Icons **Rounded** (`@mui/icons-material/*Rounded`), 24 dp (20 inside chips, 18 inside
  tags).

---

## 3. Navigation: side navigation, not a top navbar

**Decision.** Side navigation (rail, then drawer) on tablet and desktop, a bottom navigation bar on phones, and
a top app bar for the page title, search and account.

| Option | For | Against |
| --- | --- | --- |
| Top horizontal navbar | Familiar on marketing sites | Takes vertical space that the queue and case pages need. 4-6 role-based items plus search and account overflow below 1200 px. M3 has no top-level tab navigation for app destinations. |
| **Side navigation (rail -> drawer)** | The M3 pattern for medium and larger windows. Scales vertically. Room for counts (Queue 12). Fixed position for keyboard users. Leaves full height for list-detail. | Uses width. Mitigated by the 80 dp rail up to 1199 px. |
| **Bottom bar on phones** | Thumb reach; the M3 standard for compact windows | Holds at most 5 items, so the rest go in a "More" sheet |

### 3.1 Behaviour by window size class

| Class | Width | Navigation | Top app bar | Panes |
| --- | --- | --- | --- | --- |
| Compact | < 600 | **Navigation bar** (bottom, 80 dp, <= 4 destinations + **More**) | Title, search icon (expands into a full-screen search view), avatar | 1 |
| Medium | 600-839 | **Navigation rail** (80 dp, icons with labels; FAB slot) | Title, inline search bar, avatar | 1 |
| Expanded | 840-1199 | Navigation rail | Same | **2** (list 360 + detail) |
| Large | 1200-1599 | **Standard navigation drawer** (permanent, 256 dp, grouped) | Title moves to the drawer header; search and avatar stay | 2 (list 400 + detail, with a supporting pane in the detail) |
| Extra-large | >= 1600 | Standard drawer | Same | 2-3 (appeal review shows 3 columns) |

Navigation surfaces and the top app bar use the `chrome` colour (white in light), so they frame the grey work area
as one L-shaped band. Cards and regions inside the work area are white too, separated from the chrome by the canvas.

**Active item:**

- rail and bar: `secondaryContainer` pill indicator (64 x 32, or 56 x 32 on the rail) behind the icon, with the
  label in `onSurface` at weight 500
- drawer: the row (height 40, radius 4) filled with `secondaryContainer`, label in `onSecondaryContainer` at weight
  500

**Drawer:** 256 wide on `chrome`. The header is 64 high, level with the top app bar, and holds the product name in
titleMedium (the app bar leaves the name out from 1200 px). Rows are 40 high with no gap between them: a 20 dp icon
in `onSurfaceVariant` and the label in bodyMedium `onSurface`, 12 px side padding, hover state layer. Section
headers are labelMedium in `onSurfaceVariant`, 4 px above the first row of the group and 16 px between groups. The
theme toggle and "Switch demo user" sit at the bottom in the same 40 px rows. Rows are pointer targets (>= 40); the
bar and rail keep 48 dp touch targets.

### 3.2 Destinations by role (counts update every 30 s)

| Role | Bottom bar (compact) | Rail and drawer (grouped in the drawer) |
| --- | --- | --- |
| author | Feed, My content, Policy, More | **Community:** Feed, My content, **Governance:** Policy, **System:** Status |
| moderator | Queue(n), Audit, Metrics, More | **Moderation:** Queue, **Governance:** Policy, Audit, Metrics, **System:** Status |
| senior_moderator | Queue(n), Appeals(n), Audit, More | **Moderation:** Queue, Appeals, **Governance:** Policy, Audit, Metrics, **System:** Status |
| admin | Policy, Queue, Appeals, More | **Governance:** Policy, Audit, Metrics, **Oversight:** Queue, Appeals, **System:** Status (job controls live on the status page) |

- **More** opens a modal bottom sheet: remaining destinations, theme toggle, "Switch demo user" (demo mode),
  sign out.
- **FAB:** "New post" for authors, in the rail's FAB slot (medium and up) or bottom-right above the bar
  (compact). Radius 16, `primaryContainer`, no elevation.
- **Drawer footer:** theme toggle and demo-user switcher.

---

## 4. Component specifications (`src/ui/components`)

| Component | Spec | Notes |
| --- | --- | --- |
| **Button** (filled, tonal, text) | Height 40, **radius full**, padding 24 (16 with a leading icon; text buttons 12, or 12 / 16 with an icon), `labelLarge`, no uppercase, no elevation | Filled = the one primary action per view ("Approve recommendation"). Tonal = secondary actions. Text = low emphasis. **No outlined buttons** (no borders). Destructive confirmations use a filled button with `error` and `onError`. Text buttons under a row or card are pulled out by their own side padding, so their labels line up with the text above. |
| **Icon button** | 40 visual, **48 touch target**, standard or tonal | Always has an `aria-label` and a tooltip |
| **FAB** | 56, radius 16, `primaryContainer`, no shadow | Compact only for "New post" |
| **Filter chip** | Height 32, **radius 8**, `labelLarge`. Unselected: `field` fill (no outline). Selected: `secondaryContainer` with a leading check icon | Queue and audit filters. A single horizontally scrolling row on compact. |
| **Input chip** | Same, with a trailing close (x) icon | Evidence links in the appeal form; chosen clauses in Modify |
| **Assist chip** | Same, with a leading icon | "Open history", "View clause" |
| **Tag** (not interactive) | Height 24, **radius 6**, padding 8, `labelMedium`, container colour from sec. 2.3, optional 16 dp icon | StatusTag, ActionTag, SeverityTag, EvidenceTag, AiStateTag, PolicyVersionTag, ClauseTag (`HAR-1` with the clause title as a tooltip). A smaller radius and height than chips signal "not clickable". |
| **Search bar** | Height 40 and radius 8, the same as a text field, `field` fill, leading search icon, placeholder in `onSurfaceVariant`, trailing 40 px clear button | Queue: "Search text, author or clause (e.g. HAR-1)". Debounced 300 ms; synced to `?q=`. |
| **Text field** | M3 **outlined**: radius 8, 1 px `outline`, 2 px `primary` on focus, label in bodyMedium; single line 40 high (size small); multi-line grows from its `minRows`. Helper, error and counter text in bodySmall, aligned with the field's left edge | Content composer (counter 0/2000), rationale, appeal statement, policy JSON. Errors name the field. |
| **Select / menu** | Outlined field (as above) with a menu: radius 8, `surfaceContainerHigh`, no shadow | Action and policy-version pickers, audit filters |
| **Segmented choice** | Use **single-select filter chips** for the action (`none`, `label`, `limit`, `remove`); disallowed actions are disabled with a tooltip explaining why | Modify form |
| **Card** | `card` colour, radius 8, padding 16 (12 below 840 px), **no border, no shadow** | Optional header: `titleSmall` with trailing actions |
| **Nested section** | `cardNested`, radius 4, padding 12 | Findings, AI run details, timeline items, comments |
| **Row list** | One card-coloured region holding rows edge to edge, split by a 1 px tonal step (surfaceContainerHigh between rows); the region clips the rows to its radius | Feed posts, queue, appeals, audit (below 840 px) |
| **List row** | Min height 64, padding 8 / 16, a 2-line headline in bodyMedium, supporting text in bodySmall, trailing column (tag and age); hover state layer; selected = `secondaryContainer` with `aria-current="page"`; focus ring inset. An optional 4 dp accent bar at the start shows severity (sec. 2.3) in colour, a filled box, not a border; the supporting text names the severity in words | Queue (severity bar), appeals, my content |
| **Data table** (audit, >= 840 px) | No outer border; header `labelLarge` in `onSurfaceVariant`; 1 px `outlineVariant` row dividers (the only dividers in the app); row hover layer | Becomes a row list on compact |
| **Top app bar** | Height 64, `chrome`. Product name in titleMedium, the role tag and the avatar menu on the right. From 1200 px the name sits in the drawer header instead | Back button on detail pages for compact and medium |
| **Navigation bar, rail, drawer** | See sec. 3 | `aria-current="page"` on the active item |
| **Tabs** (secondary) | Case page sections on compact: Content, Findings, History | Indicator 2 dp `primary` |
| **Stepper** | An ordered list: 24 dp numbered markers joined by a 1 dp `outlineVariant` line; done steps show a check on `primary`, the current step a number on `primary` with its label at weight 500 and `aria-current="step"`, later steps a number on `surfaceContainerHighest`. Steps stack below 560 px of container width | Policy publish (4 steps) |
| **Dialog** | Radius 16, `surfaceContainerHigh`, padding 24, scrim 32%, max width 560 | **Full-screen dialog on compact** for the composer, appeal and policy publish |
| **Bottom sheet** (modal) | Top radius 16, `surfaceContainerLow`, drag handle | Compact: Modify and Reject forms, "More" menu, report form |
| **Snackbar** | `inverseSurface`, radius 4, 4-8 s, optional action ("Undo" is **not** offered for decisions; "View" is) | `role="status"` with `aria-live="polite"` |
| **Banner** (inline) | Radius 4, min height 48, padding 8 / 16, in the semantic container colour (neutral = `cardNested`): a 20 dp icon, the message in bodyMedium and an optional text action on **one row, centred vertically**. Below 480 px of banner width the action moves under the message and lines up with its text | "AI unavailable - rule findings only, Re-analyse", "Policy changed since this decision", "This post has limited reach - Show anyway" |
| **Progress** | Linear 4 dp (re-evaluation run, card loading), circular 20 dp inside buttons | Always with a text label ("8 of 12 re-analysed") |
| **Skeleton** | `surfaceContainerHigh` blocks with the card radius, shaped like the final content; shimmer unless reduced motion | One per view (list, card, case) |
| **EmptyState** | Left-aligned: a 20 dp icon in `onSurfaceVariant` beside a `titleSmall` title, one line of help in bodyMedium and an optional tonal action | sec. 7 |
| **ErrorState** | Left-aligned: a 20 dp `error_outline` icon in `error`, the message, the request ID in `bodySmall`, a **Retry** button (or **Reload** for 409) | sec. 7 |
| **HighlightedText** | Renders plain text and wraps evidence spans in `<mark tabindex=0>` (sec. 2.3 colours). Focus or hover shows a tooltip with the clause code and title. Clicking a finding scrolls to and pulses its spans. Overlapping spans are merged. | **Never `dangerouslySetInnerHTML`** [SEC-3] |
| **ConfidenceMeter** | 4 dp linear bar, colour from sec. 2.3, label "0.72, Likely" plus the reason | |
| **Timeline** | A vertical 2 dp `outlineVariant` line with 32 dp icon dots, events as nested sections grouped by day | History, appeal outcome |
| **DiffView** | A row per clause: added (`successContainer`), removed (`errorContainer`), changed (`warningContainer`, field before -> after) | Policy compare and publish preview |
| **StatCard** | A card with a `labelMedium` title, a `headlineMedium` value and a `bodySmall` trend or detail | Metrics |
| **QueryState** | A wrapper: `isLoading` -> skeleton; `isError` -> ErrorState; empty -> EmptyState; otherwise the children | Used by every data view [UX-1] |

---

## 5. Layout and responsiveness

- **MUI breakpoints** set to the M3 classes: `xs 0, sm 600, md 840, lg 1200, xl 1600`.
- **Page margins:** 16 (compact), 24 (medium and up). Gutters 16 (list-detail at 840-1199) or 24. Content
  starts next to the navigation, left-aligned, with a max width:
  - reading pages (feed, my content, history): **840**
  - form pages (policy): **960**
  - work pages (queue, case, appeals, audit, metrics): fluid; status up to 1600
- **No horizontal scroll at 360 px.** Long words and URLs use `overflow-wrap: anywhere`. Chip rows scroll
  horizontally inside their own container. Tables become lists below 840.
- **Sticky elements:** the top app bar; the decision panel (supporting pane, >= 1200); the bottom action bar
  (case and appeal pages, < 840) placed above the navigation bar.
- **Targets:** touch targets on the bar, rail, icon buttons and More sheet are >= 48 x 48; buttons are 40 high;
  drawer rows (pointer widths, >= 1200 px) are 40 high. Every target is >= 24 x 24 (WCAG 2.5.8). Hover-only
  information is also available on focus or tap.

### 5.1 Canonical layout per screen

| Screen | Compact (< 600) | Medium (600-839) | Expanded (840-1199) | Large and up (>= 1200) |
| --- | --- | --- | --- | --- |
| Queue -> case | List; tap opens the case full screen | Same | **List-detail**: list 360 + case | List 400 + case; the case shows a **supporting pane** (recommendation and decision panel 360, sticky) once the detail pane itself is >= 760 wide (a container query: with the drawer and the list beside it, that is from about 1480 px) |
| Case detail | Tabs (Content, Findings, History) + bottom action bar (Approve, Modify, Reject) | Single column + bottom action bar | Single column in the detail pane, decision card at the end | Main column + sticky decision pane |
| Appeals -> review | List -> full-screen review, stacked panels, bottom bar "Resolve" | Same | List-detail; review shows the panels stacked | 2 columns (Original, Appeal) + Outcome and resolve full width below; **>= 1600: 3 columns** |
| Feed | Single column, FAB to compose | Left-aligned, max 840 | Same | Same (composer card at the top) |
| Policy | Version list -> clauses as an accordion | Same | Versions list + clauses | Same + compare side by side |
| Audit | List rows | List rows | Table | Table + filters in the top bar |
| Metrics, Status | Stat cards in 1 column | 2 columns | 3 columns | 4 columns, 12 px gaps |

---

## 6. Screens

Each screen uses QueryState plus the states in sec. 7.

1. **Sign-in** `/sign-in`
   - A centred card (max 440), the one centred page: outlined email and password fields; "Sign in" (filled).
   - **Demo accounts** (demo mode): a grid of tonal cards, one per role. Each shows an icon, the role, a "Try:"
     hint (for example "Moderator - decide the top case"), and signs in with one click.
   - A link to **System status**.
2. **Feed** `/feed`
   - Composer card: an outlined multi-line field with a 0/2000 counter, and a **Post** button.
   - Posts as rows in one row-list region: a 32 dp avatar initial, the name (titleSmall) and relative time
     (bodySmall) on one line, the body (`bodyLarge`), the visibility treatment (CNT-5), and text buttons
     **Comment** and **Report** close under the body.
   - A limited post shows a neutral banner, "This post has limited reach under SPAM-1." with **Show anyway** on the
     same row; once shown, the body carries a "Limited reach" tag.
   - Comments open inline.
   - **Report** opens a bottom sheet (compact) or dialog with reason **filter chips**, an optional note and a
     Submit button.
   - After posting: snackbar "Posted - being checked against policy v1". The post shows an "Analysing..." tag
     for its author until the analysis finishes.
3. **My content** `/me`
   - A list of your items as cards with StatusTag and ActionTag, the decision summary in plain words, and a tonal
     **Appeal** button with "until 21 Nov". The status tag uses the author's words, not the queue's: Being
     checked, Waiting for review, No issues found, Reviewed, Appeal pending, Appeal resolved. A **History** text
     button opens the item's timeline.
   - The appeal form is a full-screen dialog on compact: statement (counter 20-2000), up to 3 evidence links as
     input chips, and a note.
   - Appeal state and outcome are shown inline.
4. **History** `/content/[id]/history`
   - A timeline: created -> analysis v1 (staff: findings, AI run) -> decision -> appeal -> outcome -> re-analysis
     after a policy change.
   - The author sees plain language and no AI internals or reporter identities.
5. **Queue** `/queue`
   - Search bar; a filter-chip row: Needs review (default), Analysing, Auto-cleared, High, Reported,
     AI unavailable, Policy v... (menu).
   - Rows in one row-list region:
     - leading: a 4 dp severity bar (high `error`, medium `warning`, low `primary`, none `outline`)
     - headline: the excerpt (2 lines)
     - supporting: "High, Post, Alex, HAR-1, PII-1, 2 reports" (the severity in words first)
     - trailing: a priority tag ("P 85") and the age ("12 m")
   - "Showing 20 of 54" and "Load more".
6. **Case** `/queue/[caseId]`
   - **Header row:** StatusTag and the priority tag on the left; compact tonal **Reopen for review** and
     **Re-analyse** buttons (leading icon) on the right. When the row wraps (phones), the buttons start the next
     line at the left edge, under the tags.
   - **Content card:** HighlightedText; parent post (for comments) as a nested section; report reasons (counts
     only).
   - **Findings card**, three groups:
     - "Confirmed evidence": rule and verified-AI findings, each with a ClauseTag, the clause text (expandable),
       quotes, SeverityTag and a ConfidenceMeter with reasons
     - "AI interpretation - not verified evidence"
     - "Dropped by verification": invalid clauses and unverified quotes, shown for transparency
   - **Recommendation card** (supporting pane): an "AI + rules suggestion" label; ActionTag; SeverityTag;
     ConfidenceMeter; "**Why a human must decide**" as a list of reasons; PolicyVersionTag; "Analysis v3 of 3".
   - **Decision panel:**
     - **Approve recommendation** (filled)
     - **Modify** (tonal): opens action chips (disallowed actions disabled with a reason), clause input chips,
       a reason category and a rationale
     - **Reject recommendation** (text): reason and note
     - Submit shows progress. A 409 shows a banner: "This case was re-analysed (policy v2). Reload to see the
       latest analysis."
   - **Analysis versions** (expandable).
   - **AI run details** (expandable): model, fallback used, prompt version, tokens in/out/thinking, cost,
     latency, attempts, parse strategy, repair used.
   - Open history from the content card; Re-analyse and Reopen (if auto-cleared) in the header row.
   - Admin: the same view with no decision panel, plus a banner "Read-only oversight".
7. **Appeals** `/appeals`: a list with "Assigned to you" first, then waiting age. A warning banner shows when an
   appeal has no eligible reviewer.
8. **Appeal review** `/appeals/[id]`
   - **Original decision** panel: action, clauses, rationale, decider, policy version, evidence highlights.
   - **Appeal evidence** panel: the statement and links, plus the **AI summary** card ("does not recommend an
     outcome", new points, disputed findings).
   - **Outcome** panel: pending, or the result, plus the resolve form: Uphold, Overturn, Modify (choice
     chips), action (for modify), rationale.
   - The original decider sees "You made the original decision - another senior moderator must review this".
     Controls are disabled.
   - "Policy changed since decision" banner when applicable.
9. **Policy** `/policy`
   - The versions list (active tag); clauses as cards or accordion; **Compare** (two selects + DiffView).
   - **Publish** (admin), a 4-step flow shown with the **Stepper**: 1 Paste or upload JSON (a plain multi-line field in the theme font, as the style audit allows only Roboto; no editor dependency) -> 2
     Validate (error list with JSON paths) -> 3 Review the diff and the impact ("12 unresolved cases will be
     re-analysed under v2") -> 4 Confirm dialog.
   - Then a re-evaluation progress card (linear progress, done/failed counts, **Retry failed**).
10. **Audit** `/audit`
    - An integrity banner ("Audit chain intact, 248 events verified"; when broken, the first broken event and a
      **Show event** button that searches for it).
    - Filters (in the URL): actor type chips (People, System, AI), action and entity selects, a from/to date
      range. Search covers a person's name or email, the entity, the request ID and `#<event>`. A table from
      840 px, a list below, "Showing 25 of 248" and **Load more**. A row expands to its details and the
      before/after JSON as plain text in the theme font (the style audit allows only Roboto).
11. **Metrics** `/metrics`
    - Stat cards: agreement %, overrides, AI failure %, p50 latency, tokens and cost (24 h and 7 d).
    - Simple CSS bar lists: override reasons, AI failures by reason, cost by day. No chart library.
12. **Status** `/status` (public, a 64 px `chrome` bar with the product name and **Sign in**)
    - The page heading with **Refresh** on the right.
    - An overall banner in the state's container colour: "All systems operational", "Degraded: some checks need
      attention" or "Outage: at least one check is failing", with the time of the last check.
    - A grid of check cards (sec. 5.1). Each has a state icon, a title, key-value details and "checked 12 s ago".
    - Release SHA linked to the GitHub commit. Auto-refresh every 30 s.
    - Admin only: **Process pending jobs**.
13. **Errors:** 404 "Not found", 403 "You don't have access to this", and a global error boundary with Retry and
    the request ID. Each is a left-aligned page heading and one card with the message and the next action.

---

## 7. States and microcopy

| State | Treatment | Example copy |
| --- | --- | --- |
| Loading | A skeleton shaped like the content; buttons show a spinner and are disabled | - |
| Empty (queue) | EmptyState | "Queue is clear. New posts and reports will appear here." |
| Empty (my content) | EmptyState + action | "You haven't posted yet.", **Write a post** |
| Empty (search) | EmptyState + clear | "No cases match 'HAR-9'.", **Clear filters** |
| Validation | Inline under the field, plus focus on the first invalid field | "Write at least 1 character.", "Keep it under 2,000 characters (2,140).", "Explain your change in at least 10 characters." |
| Success | Snackbar | "Decision saved - content labelled under HAR-1.", "Appeal sent. A senior moderator will review it." |
| Failure (network or 500) | ErrorState or an inline banner; **typed input is kept** | "Couldn't save your decision. Your choices are kept - try again.", **Retry** |
| Conflict (409 stale) | Banner + **Reload** | "This case changed while you were reviewing it (re-analysed under policy v2). Reload to decide on the latest analysis." |
| Forbidden (403) | Page or banner | "Only a different senior moderator can review an appeal of your own decision." |
| Rate limited (429) | Banner with time | "You're posting quickly. Try again in 40 seconds." |
| Processing | Tag + inline progress | "Analysing... (rules done, AI review running)" |
| AI unavailable | Warning banner | "AI review unavailable (quota reached). Rule findings are shown - a human must decide. **Re-analyse**" |
| Insufficient context | Warning tag + reason | "The AI couldn't judge this without more context - please review." |

---

## 8. Accessibility checklist [UX-3]

- Semantic landmarks: `nav`, `main`, `header`. One `h1` per page. A skip link to the content.
- Every input has a visible label. Errors are linked with `aria-describedby`, and focus moves to the first error.
- Keyboard: full tab order; arrow keys inside chip groups and the navigation rail; `Esc` closes dialogs and
  sheets; focus returns to the trigger.
- Focus indicator: 3 px `secondary` ring, offset 2, always visible on `:focus-visible`.
- Text contrast >= 4.5:1 (M3 on-colour pairs guarantee it). Never colour alone: tags have icons and text.
- Snackbars and progress use `aria-live="polite"`. Highlight marks have accessible names ("Evidence for HAR-1").
- Respect `prefers-reduced-motion` and `prefers-color-scheme`. Zoom to 200% works without loss.

---

## 9. MUI implementation notes

```ts
// src/ui/theme/theme.ts (sketch); layout constants live in src/ui/theme/layout.ts
createTheme({
  cssVariables: { colorSchemeSelector: 'class' },        // + <InitColorSchemeScript/> to avoid a flash
  colorSchemes: { light: { palette: paletteFrom(tokens.light) }, dark: { palette: paletteFrom(tokens.dark) } },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: 8 },
  spacing: 4,                                              // 1 unit = 4 px (M3 4 dp grid); check-ui-rules relies on it
  typography: { fontFamily: roboto.style.fontFamily, h1: { ...titleLarge, [compact]: titleMedium }, /* + M3 scale */ },
  components: {
    MuiPaper:   { defaultProps: { elevation: 0 } },
    MuiCard:    { defaultProps: { elevation: 0 }, styleOverrides: { root: ({ theme }) => ({ borderRadius: 8, background: theme.vars.palette.m3.card }) } },
    MuiButton:  { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 9999, height: 40, paddingInline: 24 }, text: { paddingInline: 12 } } },
    MuiFab:     { styleOverrides: { root: { borderRadius: 16, boxShadow: 'none' } } },
    MuiChip:    { styleOverrides: { root: { borderRadius: 8, height: 32 } } },
    MuiAppBar:  { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiDrawer:  { styleOverrides: { paper: { border: 0 } } },
    MuiDialog:  { styleOverrides: { paper: { borderRadius: 16 } } },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8 } } },   // + outline colours per state
    MuiFormHelperText: { styleOverrides: { root: { marginInline: 0 } } },
    MuiMenu:    { defaultProps: { elevation: 0 } },
    MuiPopover: { defaultProps: { elevation: 0 } },
  },
});
```

- Put the full M3 role set under a custom `palette.m3` (with TypeScript module augmentation). MUI then generates
  `--mui-palette-m3-*` CSS variables. Custom components use `theme.vars.palette.m3.*` only. **No hex values
  outside `tokens.ts`.**
- Map the M3 roles to MUI's palette:
  - `primary.main` = primary, `contrastText` = onPrimary
  - `background.default` = canvas, `background.paper` = card
  - `error`, `success` and `warning` from sec. 2.1
  - `text.primary` = onSurface, `text.secondary` = onSurfaceVariant
- Menus and popovers have no shadow, so give them `surfaceContainerHigh` against the white `card` and `chrome`, a
  scrim-less separation by tone.
- Use `@mui/material-nextjs` `AppRouterCacheProvider` in the root layout. Load Roboto with `next/font/google`.
- Lint rule (grep in CI): fail on `boxShadow:` values other than `'none'`, and on `dangerouslySetInnerHTML`.
