# 03 - UI/UX and design system (Material 3, no elevation)

A **Material 3** product UI with **no shadows**: depth and grouping come from **tonal surface colours**, not
elevation or borders. Pill-shaped buttons, 8 dp chips, compact tags, a full-rounded search bar, and side
navigation that adapts to the screen width.

The rule for every screen: **the evidence sits next to the decision, and the AI's suggestion is always
visibly different from what a human decided.**

---

## 1. Principles

1. **Tonal, flat surfaces.** No `box-shadow` anywhere (elevation 0). Cards are separated from the page by
   colour (white card on a tinted canvas), not by borders.
2. **Evidence first.** Highlighted quotes, cited clause text and confidence reasons appear next to the
   recommendation and the decision buttons.
3. **AI vs human is always visible.** AI output is labelled ("AI suggestion", "AI interpretation - not verified
   evidence"). Human outcomes are labelled with the person and time. Persistent copy: "AI recommends, humans
   decide."
4. **Uncertainty is a normal state.** "AI unavailable", "Insufficient context" and "Analysing..." are designed
   states, not errors.
5. **Every view has five states:** loading, empty, error, validation and success (see sec. 7).
6. **Plain language.** Error messages say what happened and what to do next.

---

## 2. Design tokens

### 2.1 Colour: generated M3 scheme (Tonal Spot, seed `#4A5FC1`)

These colours were generated with `@material/material-color-utilities` 0.3.0. Success and warning are custom
colours harmonised to the seed.

| Role | Light | Dark |
| --- | --- | --- |
| primary / onPrimary | `#505B92` / `#FFFFFF` | `#B9C3FF` / `#212C61` |
| primaryContainer / onPrimaryContainer | `#DDE1FF` / `#384379` | `#384379` / `#DDE1FF` |
| secondary / onSecondary | `#5A5D72` / `#FFFFFF` | `#C3C5DD` / `#2C2F42` |
| secondaryContainer / onSecondaryContainer | `#DFE1F9` / `#434659` | `#434659` / `#DFE1F9` |
| tertiary / onTertiary | `#76546E` / `#FFFFFF` | `#E5BAD8` / `#44263E` |
| tertiaryContainer / onTertiaryContainer | `#FFD7F2` / `#5C3C55` | `#5C3C55` / `#FFD7F2` |
| error / onError | `#BA1A1A` / `#FFFFFF` | `#FFB4AB` / `#690005` |
| errorContainer / onErrorContainer | `#FFDAD6` / `#93000A` | `#93000A` / `#FFDAD6` |
| success / onSuccess | `#006D43` / `#FFFFFF` | `#76DAA1` / `#003920` |
| successContainer / onSuccessContainer | `#92F7BC` / `#002111` | `#005231` / `#92F7BC` |
| warning / onWarning | `#974806` / `#FFFFFF` | `#FFB68A` / `#522300` |
| warningContainer / onWarningContainer | `#FFDBC8` / `#321300` | `#743400` / `#FFDBC8` |
| surface / onSurface | `#FBF8FF` / `#1B1B21` | `#121318` / `#E3E1E9` |
| onSurfaceVariant | `#45464F` | `#C6C5D0` |
| surfaceContainerLowest | `#FFFFFF` | `#0D0E13` |
| surfaceContainerLow | `#F5F2FA` | `#1B1B21` |
| surfaceContainer | `#EFEDF4` | `#1F1F25` |
| surfaceContainerHigh | `#E9E7EF` | `#292A2F` |
| surfaceContainerHighest | `#E3E1E9` | `#34343A` |
| outline / outlineVariant | `#767680` / `#C6C5D0` | `#90909A` / `#45464F` |
| inverseSurface / inverseOnSurface | `#303036` / `#F2F0F7` | `#E3E1E9` / `#303036` |

### 2.2 Surface roles: how "no elevation, no border" works

| Semantic role | Light | Dark | Used for |
| --- | --- | --- | --- |
| `canvas` (page background) | surfaceContainer `#EFEDF4` | surface `#121318` | Body, navigation rail and drawer, top app bar |
| `card` | surfaceContainerLowest `#FFFFFF` | surfaceContainer `#1F1F25` | Every card and pane |
| `cardNested` | surfaceContainerLow `#F5F2FA` | surfaceContainerHigh `#292A2F` | Sections inside a card (findings, AI run details, timeline items) |
| `field` | surfaceContainerHighest `#E3E1E9` | surfaceContainerHighest `#34343A` | Filled text fields, search bar, unselected filter chips |
| `selected` | secondaryContainer | secondaryContainer | Selected list row, active navigation item, selected chip |
| `scrim` | `#000` at 32% | `#000` at 32% | Behind dialogs and the modal drawer |

**Why this works without borders.** The light canvas and card differ by enough to read as separate planes
(about 1.15:1). WCAG does not require 3:1 for purely decorative grouping. Where an edge **carries meaning**, we
keep a visible indicator:

- **text fields** keep the M3 bottom active indicator (1 px `onSurfaceVariant`, 2 px `primary` on focus), which
  meets WCAG 1.4.11
- the **focus ring** is 3 px `secondary`, offset 2 px
- **dividers** are used only inside data tables (`outlineVariant`)

Everything else is borderless.

### 2.3 Semantic colour mapping (always icon + text, never colour alone)

| Concept | Value | Container / content colours | Icon (Material Symbols Rounded) |
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
| Confidence | >= 0.85 | success | Bar plus text label |
| | 0.7-0.84 | primary | Bar plus text label |
| | 0.4-0.69 | warning | Bar plus text label |
| | < 0.4 | error | Bar plus text label |

### 2.4 Typography (M3 type scale, Roboto 400/500)

| Token | Size / line height | Weight | Used for | MUI variant |
| --- | --- | --- | --- | --- |
| headlineSmall | 24 / 32 | 400 | Page title in content | `h1` (restyled) |
| titleLarge | 22 / 28 | 400 | Top app bar title, dialog title | `h2` |
| titleMedium | 16 / 24 | 500 | Card titles, section headers | `h3` |
| titleSmall | 14 / 20 | 500 | Sub-sections, list headlines | `h4` |
| bodyLarge | 16 / 24 | 400 | **Moderated content text** (readability) | `body1` |
| bodyMedium | 14 / 20 | 400 | Default text | `body2` |
| bodySmall | 12 / 16 | 400 | Supporting text, timestamps | `caption` |
| labelLarge | 14 / 20 | 500 | Buttons, tabs | `button` (no uppercase) |
| labelMedium | 12 / 16 | 500 | Chips, tags, navigation labels | `overline` (restyled, no uppercase) |
| displaySmall | 36 / 44 | 400 | Stat values on metrics and status | custom `display` |

### 2.5 Shape, spacing, state layers, motion

- **Shape:** extra-small 4, small 8 (chips, tags, tooltips), medium 12 (cards, list rows, menus), large 16 (FAB,
  navigation drawer items' container), extra-large 28 (dialogs, bottom sheets), **full** (buttons, search bar,
  navigation indicators, segmented controls).
- **Spacing (4 dp grid):** 4, 8, 12, 16, 24, 32, 48. Card padding 16 (compact) or 24 (medium and up).
  Gap between cards 16 or 24.
- **State layers** (`onSurface` or the content colour at this opacity): hover 8%, focus 10%, pressed 10%,
  dragged 16%. Disabled: content at 38%, container at 12%.
- **Motion:**
  - standard `cubic-bezier(0.2,0,0,1)`, 200 ms (state changes)
  - emphasised decelerate `cubic-bezier(0.05,0.7,0.1,1)`, 400 ms (entering panes and sheets)
  - emphasised accelerate `cubic-bezier(0.3,0,0.8,0.15)`, 200 ms (exit)

  `prefers-reduced-motion`: no shimmer, no slide, instant changes.
- **Icons:** Material Symbols **Rounded** (`@mui/icons-material/*Rounded`), 24 dp (20 inside chips, 18 inside
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
| Large | 1200-1599 | **Standard navigation drawer** (permanent, 280 dp, grouped) | Same | 2 (list 400 + detail, with a supporting pane in the detail) |
| Extra-large | >= 1600 | Standard drawer | Same | 2-3 (appeal review shows 3 columns) |

Navigation surfaces use the `canvas` colour, so the rail and drawer blend into the page. Only the cards are white.

**Active item:**

- rail and bar: `secondaryContainer` pill indicator (64 x 32, or 56 x 32 on the rail) behind the icon, with the
  label in `onSurface` at weight 500
- drawer: a full-width pill (height 56, radius full) in `secondaryContainer`

### 3.2 Destinations by role (counts update every 30 s)

| Role | Bottom bar (compact) | Rail and drawer (grouped in the drawer) |
| --- | --- | --- |
| author | Feed, My content, Policy, More | **Community:** Feed, My content, **Governance:** Policy, **System:** Status |
| moderator | Queue(n), Audit, Metrics, More | **Moderation:** Queue, **Governance:** Policy, Audit, Metrics, **System:** Status |
| senior_moderator | Queue(n), Appeals(n), Audit, More | **Moderation:** Queue, Appeals, **Governance:** Policy, Audit, Metrics, **System:** Status |
| admin | Policy, Queue, Appeals, More | **Governance:** Policy, Audit, Metrics, **Oversight:** Queue, Appeals, **System:** Status, Jobs |

- **More** opens a modal bottom sheet: remaining destinations, theme toggle, "Switch demo user" (demo mode),
  sign out.
- **FAB:** "New post" for authors, in the rail's FAB slot (medium and up) or bottom-right above the bar
  (compact). Radius 16, `primaryContainer`, no elevation.
- **Drawer footer:** theme toggle and demo-user switcher.

---

## 4. Component specifications (`src/ui/components`)

| Component | Spec | Notes |
| --- | --- | --- |
| **Button** (filled, tonal, text) | Height 40, **radius full**, padding 24 (16 with a leading icon), `labelLarge`, no uppercase, no elevation | Filled = the one primary action per view ("Approve recommendation"). Tonal = secondary actions. Text = low emphasis. **No outlined buttons** (no borders). Destructive confirmations use a filled button with `error` and `onError`. |
| **Icon button** | 40 visual, **48 touch target**, standard or tonal | Always has an `aria-label` and a tooltip |
| **FAB** | 56, radius 16, `primaryContainer`, no shadow | Compact only for "New post" |
| **Filter chip** | Height 32, **radius 8**, `labelLarge`. Unselected: `field` fill (no outline). Selected: `secondaryContainer` with a leading check icon | Queue and audit filters. A single horizontally scrolling row on compact. |
| **Input chip** | Same, with a trailing close (x) icon | Evidence links in the appeal form; chosen clauses in Modify |
| **Assist chip** | Same, with a leading icon | "Open history", "View clause" |
| **Tag** (not interactive) | Height 24, **radius 6**, padding 8, `labelMedium`, container colour from sec. 2.3, optional 16 dp icon | StatusTag, ActionTag, SeverityTag, EvidenceTag, AiStateTag, PolicyVersionTag, ClauseTag (`HAR-1` with the clause title as a tooltip). A smaller radius and height than chips signal "not clickable". |
| **Search bar** | Height 56, **radius full**, `field` fill, leading search icon, placeholder in `onSurfaceVariant`, trailing clear button | Queue: "Search text, author or clause (e.g. HAR-1)". Debounced 300 ms; synced to `?q=`. Compact: a full-screen search view. |
| **Text field** | M3 **filled**: `field` fill, top radius 4, bottom active indicator, label, helper and error text, character counter | Content composer (counter 0/2000), rationale, appeal statement. Errors name the field. |
| **Select / menu** | Filled field with a menu: radius 12, `surfaceContainer`, no shadow (separated by a scrim-less tonal contrast) | Action and policy-version pickers |
| **Segmented choice** | Use **single-select filter chips** for the action (`none`, `label`, `limit`, `remove`); disallowed actions are disabled with a tooltip explaining why | Modify form |
| **Card** | `card` colour, radius 12, padding 16 or 24, **no border, no shadow** | Optional header: `titleMedium` with trailing actions |
| **Nested section** | `cardNested`, radius 12, padding 12-16 | Findings, AI run details, timeline items |
| **List row** | Height 56, 72 or 88 (1-3 lines), radius 12, hover state layer, selected = `secondaryContainer`, 4 dp gaps instead of dividers | Queue, appeals, my content |
| **Data table** (audit, >= 840 px) | No outer border; header `labelLarge` in `onSurfaceVariant`; 1 px `outlineVariant` row dividers (the only dividers in the app); row hover layer | Becomes a list on compact |
| **Top app bar** | Height 64, `canvas`. On scroll, changes to `surfaceContainer` (a tonal change, not a shadow) | Back button on detail pages for compact and medium |
| **Navigation bar, rail, drawer** | See sec. 3 | `aria-current="page"` on the active item |
| **Tabs** (secondary) | Case page sections on compact: Content, Findings, History | Indicator 2 dp `primary` |
| **Dialog** | Radius 28, `surfaceContainerHigh`, scrim 32%, max width 560 | **Full-screen dialog on compact** for the composer, appeal and policy publish |
| **Bottom sheet** (modal) | Top radius 28, `surfaceContainerLow`, drag handle | Compact: Modify and Reject forms, "More" menu, report form |
| **Snackbar** | `inverseSurface`, radius 4, 4-8 s, optional action ("Undo" is **not** offered for decisions; "View" is) | `role="status"` with `aria-live="polite"` |
| **Banner** (inline) | A nested section in the semantic container colour with an icon, a message and an action | "AI unavailable - rule findings only, Re-analyse", "Policy changed since this decision", "Demo mode" |
| **Progress** | Linear (re-evaluation run, card loading), circular 20 dp inside buttons | Always with a text label ("8 of 12 re-analysed") |
| **Skeleton** | `surfaceContainerHigh` blocks shaped like the final content; shimmer unless reduced motion | One per view (list, card, case) |
| **EmptyState** | Icon 48 (`onSurfaceVariant`), `titleMedium`, one line of help, an optional tonal action | sec. 7 |
| **ErrorState** | Icon `error_outline`, the message, a **Retry** button (or **Reload** for 409), the request ID in `bodySmall` | sec. 7 |
| **HighlightedText** | Renders plain text and wraps evidence spans in `<mark tabindex=0>` (sec. 2.3 colours). Focus or hover shows a tooltip with the clause code and title. Clicking a finding scrolls to and pulses its spans. Overlapping spans are merged. | **Never `dangerouslySetInnerHTML`** [SEC-3] |
| **ConfidenceMeter** | 4 dp linear bar, colour from sec. 2.3, label "0.72, Likely" plus the reason | |
| **Timeline** | A vertical 2 dp `outlineVariant` line with 32 dp icon dots, events as nested sections grouped by day | History, appeal outcome |
| **DiffView** | A row per clause: added (`successContainer`), removed (`errorContainer`), changed (`warningContainer`, field before -> after) | Policy compare and publish preview |
| **StatCard** | A card with a `labelMedium` title, a `displaySmall` value and a `bodySmall` trend or detail | Metrics and status |
| **QueryState** | A wrapper: `isLoading` -> skeleton; `isError` -> ErrorState; empty -> EmptyState; otherwise the children | Used by every data view [UX-1] |

---

## 5. Layout and responsiveness

- **MUI breakpoints** set to the M3 classes: `xs 0, sm 600, md 840, lg 1200, xl 1600`.
- **Page margins:** 16 (compact), 24 (medium and up). Gutters 16 or 24. Content max width:
  - reading pages (feed, my content, history): **680** centred
  - work pages (queue, case, appeals, audit): fluid
- **No horizontal scroll at 360 px.** Long words and URLs use `overflow-wrap: anywhere`. Chip rows scroll
  horizontally inside their own container. Tables become lists below 840.
- **Sticky elements:** the top app bar; the decision panel (supporting pane, >= 1200); the bottom action bar
  (case and appeal pages, < 840) placed above the navigation bar.
- **Touch targets** are >= 48 x 48. Hover-only information is also available on focus or tap.

### 5.1 Canonical layout per screen

| Screen | Compact (< 600) | Medium (600-839) | Expanded (840-1199) | Large and up (>= 1200) |
| --- | --- | --- | --- | --- |
| Queue -> case | List; tap opens the case full screen | Same | **List-detail**: list 360 + case | List 400 + case with a **supporting pane** (decision panel 360, sticky) |
| Case detail | Tabs (Content, Findings, History) + bottom action bar (Approve, Modify, Reject) | Single column + bottom action bar | Single column in the detail pane, decision card at the end | Main column + sticky decision pane |
| Appeals -> review | List -> full-screen review, stacked panels, bottom bar "Resolve" | Same | List-detail; review shows the panels stacked | 2 columns (Original, Appeal) + Outcome and resolve full width below; **>= 1600: 3 columns** |
| Feed | Single column, FAB to compose | Centred 680 | Centred 680 | Centred 680 (composer card at the top) |
| Policy | Version list -> clauses as an accordion | Same | Versions list + clauses | Same + compare side by side |
| Audit | List rows | List rows | Table | Table + filters in the top bar |
| Metrics, Status | Stat cards in 1 column | 2 columns | 3 columns | 4 columns |

---

## 6. Screens

Each screen uses QueryState plus the states in sec. 7.

1. **Sign-in** `/sign-in`
   - A centred card (max 440): email and password fields; "Sign in" (filled).
   - **Demo accounts** (demo mode): a grid of tonal cards, one per role. Each shows an icon, the role, a "Try:"
     hint (for example "Moderator - decide the top case"), and signs in with one click.
   - A link to **System status**.
2. **Feed** `/feed`
   - Composer card: a filled text field with a 0/2000 counter, and a **Post** button.
   - Post cards: avatar initial, name, relative time, body (`bodyLarge`), visibility treatment (CNT-5), and text
     buttons **Comment** and **Report**.
   - Comments open inline.
   - **Report** opens a bottom sheet (compact) or dialog with reason **filter chips**, an optional note and a
     Submit button.
   - After posting: snackbar "Posted - being checked against policy v1". The post shows an "Analysing..." tag
     for its author until the analysis finishes.
3. **My content** `/me`
   - A list of your items with StatusTag and ActionTag, the decision summary in plain words, and a tonal
     **Appeal** button with "until 21 Nov".
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
   - Rows:
     - leading: a 40 dp severity icon in a tonal circle
     - headline: the excerpt (2 lines)
     - supporting: "Post, Alex, HAR-1, PII-1, 2 reports"
     - trailing: a priority tag ("P 85") and the age ("12 m")
   - "Showing 20 of 54" and "Load more".
6. **Case** `/queue/[caseId]`
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
   - Overflow menu: Re-analyse, Reopen (if auto-cleared), Open history.
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
   - **Publish** (admin), a 4-step flow: 1 Paste or upload JSON (a monospace field, no editor dependency) -> 2
     Validate (error list with JSON paths) -> 3 Review the diff and the impact ("12 unresolved cases will be
     re-analysed under v2") -> 4 Confirm dialog.
   - Then a re-evaluation progress card (linear progress, done/failed counts, **Retry failed**).
10. **Audit** `/audit`
    - An integrity banner ("Audit chain intact, 248 events verified").
    - Filters: actor, action, entity, date range. Search. Table or list. A row expands to before/after JSON
      (monospace, plain text).
11. **Metrics** `/metrics`
    - Stat cards: agreement %, overrides, AI failure %, p50 latency, tokens and cost (24 h and 7 d).
    - Simple CSS bar lists: override reasons, AI failures by reason, cost by day. No chart library.
12. **Status** `/status` (public, minimal top bar: app name + Sign in)
    - An overall banner: "All systems operational", "Degraded: AI on fallback model" or "Outage: database".
    - A grid of check cards (sec. 5.1). Each has a state icon, a title, key-value details and "checked 12 s ago".
    - Release SHA linked to the GitHub commit. Auto-refresh every 30 s plus a **Refresh** button.
    - Admin only: **Process pending jobs**.
13. **Errors:** 404 "Not found", 403 "You don't have access to this", and a global error boundary with Retry and
    the request ID.

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
// src/ui/theme/theme.ts (sketch)
createTheme({
  cssVariables: { colorSchemeSelector: 'class' },        // + <InitColorSchemeScript/> to avoid a flash
  colorSchemes: { light: { palette: paletteFrom(tokens.light) }, dark: { palette: paletteFrom(tokens.dark) } },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: 12 },
  typography: { fontFamily: roboto.style.fontFamily, button: { textTransform: 'none', fontWeight: 500 } /* + M3 scale */ },
  components: {
    MuiPaper:   { defaultProps: { elevation: 0 } },
    MuiCard:    { defaultProps: { elevation: 0 }, styleOverrides: { root: ({ theme }) => ({ borderRadius: 12, background: theme.vars.palette.m3.card }) } },
    MuiButton:  { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 9999, height: 40, paddingInline: 24 } } },
    MuiFab:     { styleOverrides: { root: { borderRadius: 16, boxShadow: 'none' } } },
    MuiChip:    { styleOverrides: { root: { borderRadius: 8, height: 32 } } },
    MuiAppBar:  { defaultProps: { elevation: 0, color: 'inherit' } },
    MuiDrawer:  { styleOverrides: { paper: { border: 0 } } },
    MuiDialog:  { styleOverrides: { paper: { borderRadius: 28 } } },
    MuiTextField: { defaultProps: { variant: 'filled' } },
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
- Menus and popovers have no shadow, so give them `surfaceContainer` against the `card`, and a scrim-less
  separation by tone. If a menu sits on the same colour, use `surfaceContainerHigh`.
- Use `@mui/material-nextjs` `AppRouterCacheProvider` in the root layout. Load Roboto with `next/font/google`.
- Lint rule (grep in CI): fail on `boxShadow:` values other than `'none'`, and on `dangerouslySetInnerHTML`.
