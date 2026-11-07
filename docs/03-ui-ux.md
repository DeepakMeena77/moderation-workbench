# 03 - UI/UX and design system

A quiet, neutral product UI for a professional tool. Neutral surfaces with 1 px hairlines do the structural work;
one blue accent marks what can be acted on; red, amber, green and blue appear only where they carry meaning. No
shadows, no gradients. MUI is the component library; the design uses its own tokens (sec. 2) and shapes (sec. 4).

The rule for every screen: **the evidence sits next to the decision, and the AI's suggestion is always
visibly different from what a human decided.**

---

## 1. Principles

1. **Neutral first.** Pages are near-white (near-black in dark), surfaces are white with a 1 px hairline, text is
   near-black with two quieter levels. No tinted page or card backgrounds.
2. **One accent.** The blue accent is used for primary buttons, links, focus rings and the selected navigation
   marker, and nowhere else.
3. **Colour only with meaning.** Severity (high red, medium amber, low grey), success, warning and info use their
   hue as a small dot, a small icon or a soft badge. Facts such as actions, versions and clause codes are neutral.
   Colour is never the only signal: every coloured mark sits next to a word.
4. **Flat.** No `box-shadow` and no gradients anywhere. Depth comes from hairlines and the scrim behind dialogs.
5. **Evidence first.** Highlighted quotes, cited clause text and confidence reasons appear next to the
   recommendation and the decision buttons.
6. **AI vs human is always visible.** AI output is labelled ("AI suggestion", "AI interpretation - not verified
   evidence"). Human outcomes are labelled with the person and time. Persistent copy: "AI recommends, humans
   decide."
7. **Uncertainty is a normal state.** "AI unavailable", "Insufficient context" and "Analysing..." are designed
   states, not errors.
8. **Every view has five states:** loading, empty, error, validation and success (see sec. 7).
9. **Plain language and precise layout.** Error messages say what happened and what to do next. Content is
   left-aligned, starts next to the navigation and keeps one rhythm on a 4 px grid.

---

## 2. Design tokens

All colours live in `src/ui/theme/tokens.ts`; shape, size and spacing constants in `src/ui/theme/layout.ts`.
Components read colours as `theme.vars.palette.m3.<role>`.

### 2.1 Colour

| Role | Light | Dark | Used for |
| --- | --- | --- | --- |
| `canvas` | `#FAFAFA` | `#0B0B0C` | Page background |
| `card` | `#FFFFFF` | `#141416` | Cards, panels, dialogs, menus, list panels, inputs |
| `chrome` | `#FFFFFF` | `#141416` | Sidebar, top bar, bottom bar |
| `cardNested` | `#FAFAFA` | `#18181B` | Quoted content and forms inside a card |
| `selected` | `#F4F4F5` | `#27272A` | Selected row, selected navigation item, selected filter |
| `border` | `#E4E4E7` | `#27272A` | The 1 px hairline on cards, panels, sidebar, top bar and between rows |
| `borderStrong` | `#D4D4D8` | `#3F3F46` | Secondary-button and chip borders at rest |
| `borderHover` | `#A1A1AA` | `#52525B` | Secondary-button borders on hover |
| `fieldBorder` | `#8E8E96` | `#6B6B74` | Text-field and search borders at rest, at least 3:1 against the field (WCAG 1.4.11) |
| `fieldBorderHover` | `#71717A` | `#A1A1AA` | Text-field and search borders on hover |
| `onSurface` (text) | `#18181B` | `#FAFAFA` | Primary text |
| `onSurfaceVariant` | `#52525B` | `#A1A1AA` | Secondary text: meta, labels, row actions |
| `textTertiary` | `#71717A` | `#8B8B94` | Tertiary text: section labels in the sidebar, placeholders, quiet detail; only on `canvas`, `card` and `chrome` |
| `primary` (accent) | `#2563EB` | `#60A5FA` | Primary buttons, links, focus rings, the selected navigation marker |
| `onPrimary` | `#FFFFFF` | `#0B0B0C` | Text on the accent |

Semantic colours (soft badge and banner: background / text / border; plus the strong hue for icons and dots):

| Meaning | Light | Dark |
| --- | --- | --- |
| Info | `#EFF6FF` / `#1D4ED8` / `#BFDBFE`, icon `#2563EB` | `#111D33` / `#93C5FD` / `#1E3A6B`, icon `#60A5FA` |
| Success | `#F0FDF4` / `#166534` / `#BBF7D0`, icon `#15803D` | `#10261A` / `#86EFAC` / `#14532D`, icon `#4ADE80` |
| Warning | `#FFFBEB` / `#92400E` / `#FDE68A`, icon and text `#B45309` | `#2A2010` / `#FCD34D` / `#4A3A12`, icon `#FBBF24` |
| Error | `#FEF2F2` / `#B91C1C` / `#FECACA`, icon `#DC2626` | `#2A1416` / `#FCA5A5` / `#5B1F22`, icon `#F87171` |
| Severity dots | high `#DC2626`, medium `#D97706`, low `#A1A1AA` | high `#F87171`, medium `#FBBF24`, low `#71717A` |

**Contrast.** Every text pair meets WCAG AA: primary text 17.7:1 (light) and 17.6:1 (dark); secondary 7.7:1 and
7.2:1; tertiary 4.8:1 on white and 4.6:1 on the canvas (5.5:1 in dark); accent text 5.2:1 and 7.2:1; white on the
accent 5.2:1; soft badge text 5.9:1 or more. The selected fill is never used under tertiary text. Hairlines are
decorative (about 1.3:1); inputs are identified by their visible label above the field, and their border darkens
on hover and turns accent on focus. The focus ring is the accent at 2 px (5.2:1 and 7.2:1). The scrim is black at
40%.

### 2.2 Semantic mapping (a word always comes with the colour)

| Concept | Value | Treatment |
| --- | --- | --- |
| Severity | high, medium, low, none | 8 px dot (red, amber, grey) plus the word: "High severity", or "High" in a definition list |
| Action | remove, limit, label, none | Neutral badge with the word; every action the same grey |
| Case status | awaiting_review | Info badge "Needs review" |
| | auto_cleared | Success badge "Auto-cleared" |
| | pending_analysis, resolved, appealed, appeal_resolved | Neutral badge with the word |
| Evidence | confirmed (AI quote verified) | Info badge "AI, quote verified"; the quote is highlighted in the text (info tint with a 1 px accent underline) |
| | rule (deterministic) | Neutral badge "Rule match"; the match is highlighted the same way |
| | interpretation | Neutral badge "AI interpretation"; **not highlighted in the text** |
| AI state | ok, fallback | Neutral badge "AI reviewed", "AI fallback model" |
| | unavailable, timeout, invalid output, ... | Error badge with the reason |
| | insufficient context | Warning badge "Insufficient context" |
| Clause code | HAR-1 | Neutral badge in system monospace |
| Content warning | labelled post | Warning badge "Warning: HAR-1" |
| Escalation | clause always goes to a human | Amber 16 px icon and the text "Always to a human", no fill |
| Check state | ok, warn, fail | Dot (green, amber, red) plus "Operational", "Degraded", "Down" |
| Confidence | 0-1 | The text "0.72, Likely" plus a 4 px bar on a hairline-coloured track (grey per finding, accent for the overall recommendation) and the reason |

### 2.3 Typography (self-hosted Roboto; system monospace for codes)

| Style | Size / line height | Weight | Used for | MUI variant |
| --- | --- | --- | --- | --- |
| Page title | 20 / 28 | 500 | One `h1` per page | `h1` |
| Section title | 15 / 22 | 500 | Card and panel titles, dialog titles | `h2`, `h3` |
| Strong body | 14 / 20 | 500 | Names, row titles, clause titles, the product name, buttons | `h4`, `subtitle1`, `button` |
| Body | 14 / 20 | 400 | All running text, including post and case content | `body1`, `body2` |
| Meta | 12 / 16 | 400 | Timestamps, supporting row text, helper text, tooltips; secondary colour | `caption` |
| Label | 12 / 16 | 500 | Badges, field labels, sidebar section labels, group labels inside cards, navigation labels | `overline` (no uppercase) |
| Mono | 12 / 16 | 400 | Clause codes, IDs, request IDs (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) | `monoSx` |
| Stat value | 28 / 36 | 500 | The number on a stat card (tabular figures) | `display` |

Sentence case everywhere; no uppercase labels. Everything is left-aligned except the sign-in card.

### 2.4 Shape, spacing, icons, motion

- **Radius:** cards, panels, dialogs and menus 8; buttons, inputs, the search bar, filter chips, nested sections,
  banners and navigation items 6; badges 4. Round shapes only for avatars, step markers and tiny count bubbles.
- **Borders:** 1 px only, in `border` (structure), `borderStrong` / `borderHover` (secondary buttons and chips) or `fieldBorder` /
  `fieldBorderHover` (text fields and search).
  Focus uses a 2 px accent ring, not a thicker border.
- **Spacing (4 px grid):** 4, 8, 12, 16, 20, 24, 32. Card padding 16 (12 below 840 px). 12 between stacked panels.
  Page padding 24 from 600 px, 16 below. 16 between the page heading and the first panel (12 below 600 px).
- **Heights:** buttons 32 (36 for the main action of a page), inputs and the search bar 36, filter chips 28,
  badges 20, sidebar rows 32, list rows at least 56, top bar 56, bottom bar 64.
- **Touch targets:** on phones every button, icon button and filter chip extends its hit area to at least 44 px
  with an invisible extension, so the visual size stays compact. Bottom-bar items are at least 48 px.
- **Hover and pressed:** a flat layer of the text colour mixed into the surface (`color-mix`, 4-12%), never a
  gradient or an overlay image.
- **Icons:** Material Icons Rounded, monochrome in the secondary text colour, 16 in buttons and badges' neighbours,
  18 in navigation and banners. Only where they help scanning: badges carry no icons, facts carry no icons.
- **Motion:** state changes 150-200 ms ease-out; no ripples. `prefers-reduced-motion`: no shimmer, no slide,
  instant changes.

---

## 3. Navigation

**Decision.** A sidebar on desktop, a rail on tablets, a bottom bar on phones, and a top bar for the product name,
role and account.

| Option | For | Against |
| --- | --- | --- |
| Top horizontal navbar | Familiar on marketing sites | Takes vertical space that the queue and case pages need. 4-6 role-based items plus account overflow below 1200 px. |
| **Sidebar (rail -> sidebar)** | Scales vertically. Room for counts. Fixed position for keyboard users. Leaves full height for list-detail. | Uses width. Mitigated by the 80 px rail up to 1199 px. |
| **Bottom bar on phones** | Thumb reach | Holds at most 4 items, so the rest go in a "More" sheet |

### 3.1 Behaviour by window size class

| Class | Width | Navigation | Top bar | Panes |
| --- | --- | --- | --- | --- |
| Compact | < 600 | **Bottom bar** (64 high, top hairline, <= 3 destinations + **More**) | Product name, avatar | 1 |
| Medium | 600-839 | **Rail** (80 wide, right hairline, icons with labels) | Page breadcrumb, role badge, avatar | 1 |
| Expanded | 840-1199 | Rail | Same | **2** (list 360 + detail) |
| Large | 1200-1599 | **Sidebar** (permanent, 240 wide, grouped) | Same; the product name sits in the sidebar header | 2 (list 400 + detail, with a supporting pane in the detail) |
| Extra-large | >= 1600 | Sidebar | Same | 2-3 (appeal review shows 3 columns) |

**Sidebar:** white with a 1 px right hairline. The header is 56 high with a bottom hairline, level with the top
bar's, and holds the product name (14/20, weight 500). Rows are 32 high with no gap between them, radius 6: an
18 px icon and the label in body text, both in the secondary text colour. Hover darkens the text and adds a flat
layer. The selected row has the neutral `selected` fill, the main text colour at weight 500 and a 2 px accent
marker at its start. Section labels are 12/16 at weight 500 in the tertiary colour, 8 px above the first group and
20 px above each following group. The theme toggle and "Switch demo user" sit at the bottom in the same rows.

**Rail and bottom bar:** white, with a right (rail) or top (bar) hairline. Each item is an icon in a 28-high,
radius-6 indicator above a 12/16 label; the active item has the neutral `selected` fill behind the icon and its
label at weight 500 in the main text colour.

**Top bar:** 56 high including its 1 px bottom hairline, white. On the left, from 600 px, the current page as a
short breadcrumb in body text ("Queue", "Queue / Case", "Appeals / Appeal", "Moderation history"): earlier parts in
the secondary colour, the current part in the main colour at weight 500, a tertiary "/" between them. On phones the
left side shows the product name (14/20, weight 500) instead. On the right, the role as a neutral badge and the
avatar menu. The page's own `h1` stays the page title.

All navigation items carry `aria-current="page"` when active.

### 3.2 Destinations by role (counts update every 30 s)

| Role | Bottom bar (compact) | Rail and sidebar (grouped in the sidebar) |
| --- | --- | --- |
| author | Feed, My content, Policy, More | **Community:** Feed, My content, **Governance:** Policy, **System:** Status |
| moderator | Queue(n), Audit, Metrics, More | **Moderation:** Queue, **Governance:** Policy, Audit, Metrics, **System:** Status |
| senior_moderator | Queue(n), Appeals(n), Audit, More | **Moderation:** Queue, Appeals, **Governance:** Policy, Audit, Metrics, **System:** Status |
| admin | Policy, Queue, Appeals, More | **Governance:** Policy, Audit, Metrics, **Oversight:** Queue, Appeals, **System:** Status (job controls live on the status page) |

- **More** opens a bottom sheet (top radius 8, top hairline): remaining destinations, theme toggle, "Switch demo
  user" (demo mode), sign out, in 44 px rows.

---

## 4. Component specifications (`src/ui/components`)

| Component | Spec | Notes |
| --- | --- | --- |
| **Button** | Radius 6, height 32 (36 with `size="large"` for the main action of a page), padding 12 (16 for the large size; 8 before a 16 px leading icon), 14/20 weight 500. **Primary:** solid accent, `onPrimary` text. **Secondary:** `card` fill, 1 px `borderStrong`, main text colour. **Ghost:** no fill, a transparent 1 px border (so it lines up with a secondary button beside it), main text colour (secondary colour for row actions), hover layer. **Destructive:** primary becomes solid error; a destructive ghost stays neutral at rest and turns error on hover and focus. Disabled at 50% opacity | One primary per view. Buttons in one row share a height and padding. |
| **Icon button** | 32 x 32, radius 6, 18 px icon in the secondary colour, hover layer; 44 px touch target on phones | Always has an `aria-label` and a tooltip |
| **Filter chip** | Content width, height 28, radius 6, 1 px `border`, `card` fill, body text in the secondary colour, the label left-aligned with 12 px side padding. Selected: the same shape with the `selected` fill, `borderStrong`, main text colour and a 14 px check right before the label. Chips sit in one wrapping row with an 8 px gap | Every chip group is this one component: queue, audit and appeal filters; report reasons; decision reasons and the Modify form's choices; the appeal outcome. One horizontally scrolling row on compact. |
| **Badge** (`Tag`, not interactive) | Height 20, radius 4, padding 8, 12/16 weight 500, a soft tint with darker text and a 1 px border in the same hue (sec. 2.1); neutral by default; text only, no icons; clause codes in monospace | StatusTag, ActionTag, AiStateTag, PolicyVersionTag, ClauseTag, EvidenceTag |
| **Dot label** | An 8 px dot plus a word, 12/16 beside badges or 14/20 in definition lists | Severity, check states |
| **Search bar** | An input: height 36, radius 6, `field` fill, 1 px `fieldBorder` (`fieldBorderHover` on hover, accent plus a 2 px accent ring at 30% on focus), 16 px search icon, placeholder in the tertiary colour, a 28 px clear button | Queue: "Search text, author or clause (e.g. HAR-1)". Debounced 300 ms; synced to `?q=`. |
| **Text field** | Label above the field (12/16 weight 500, secondary colour), never inside the border. The field: radius 6, `field` fill, 1 px `fieldBorder`, `fieldBorderHover` on hover, accent border plus a 2 px accent ring at 30% on focus, `error` when invalid; single line 36 high; multi-line grows from its `minRows`. Helper, error and counter text 12/16 under the field's left edge | Composer (counter 0/2000), rationale, appeal statement, policy JSON. Errors name the field. |
| **Select / menu** | A text field with a menu: radius 8, `card` fill, 1 px hairline, 32 px items | Policy versions, audit filters |
| **Card / panel** | `card` fill, 1 px `border`, radius 8, padding 16 (12 below 840 px), no shadow | Optional title in the section style with trailing actions |
| **Nested section** | Radius 6, 1 px `border`, padding 12; transparent, or `cardNested` for quoted content and inline forms | Findings, "Why a human must decide", parent post, comments, decision form |
| **Row list** | One bordered panel holding rows edge to edge, a 1 px hairline between rows | Feed posts, queue, appeals, audit (below 840 px) |
| **List row** | Min height 56, padding 12 / 16, a 2-line headline in body text, supporting text 12/16 in the secondary colour (a severity dot first where it applies), a trailing column (badge and age); hover layer; selected = `selected` fill, a 2 px accent marker at its start and `aria-current="page"`; inset focus ring | Queue (severity dot), appeals |
| **Data table** (audit, >= 840 px) | Inside a bordered panel; header 12/16 weight 500 in the secondary colour; 1 px hairlines between rows; hover layer | Becomes a row list on compact |
| **Stepper** | An ordered list of 20 px numbered markers joined by a 1 px hairline: done steps filled with the accent and a check, the current step filled with the accent and its label at weight 500 with `aria-current="step"`, later steps outlined in `borderStrong`. Labels wrap; the steps stack below 600 px of container width | Policy publish (4 steps) |
| **Dialog** | Radius 8, `card` fill, 1 px hairline, padding 24, scrim 40%, max width 560 | **Full-screen on compact** for the composer, appeal and policy publish |
| **Bottom sheet** | Top radius 8, `card` fill, top hairline, a small drag handle | Compact: report form, "More" menu |
| **Snackbar** | `inverseSurface` fill, radius 6, 4-8 s, optional action ("Undo" is **not** offered for decisions; "View" is) | `role="status"` with `aria-live="polite"` |
| **Banner** (inline) | Radius 6, min height 40, padding 12, a 1 px border; neutral (`cardNested`, `border`) or a soft semantic panel (sec. 2.1) with text in the darker hue; an 18 px icon in the strong hue, the message and an optional ghost or secondary action on **one row, centred vertically**. Below 480 px of banner width the action moves under the message and lines up with its text | "AI review unavailable", "Read-only oversight", "Policy changed since this decision", "This post has limited reach - Show anyway" |
| **Progress** | Linear 4 px, radius 2, hairline-coloured track, accent bar (error when there are failures); circular 16-20 px inside buttons | Always with a text label ("8 of 12 re-analysed") |
| **Skeleton** | `surfaceContainer` blocks with the card radius, shaped like the final content; shimmer unless reduced motion | One per view |
| **EmptyState** | Left-aligned: an 18 px icon in the tertiary colour beside a 14/20 weight-500 title, one line of help in the secondary colour and an optional secondary action | sec. 7 |
| **ErrorState** | Left-aligned: an 18 px `error_outline` icon in `error`, the message, the request ID in monospace, a **Retry** button (or **Reload** for 409) | sec. 7 |
| **HighlightedText** | Plain text with evidence spans in `<mark tabindex=0>` (info tint, 1 px accent underline, radius 2). Focus or hover shows a tooltip with the clause code and title. Overlapping spans are merged. | **Never `dangerouslySetInnerHTML`** [SEC-3] |
| **ConfidenceMeter** | The label "0.72, Likely", a 4 px bar (radius 2, max 240 wide) on a track in the `border` colour, and the reason. Fill: the secondary text colour per finding; the accent for the recommendation's overall confidence | |
| **Timeline** | A 1 px hairline joining 24 px outlined markers with a 14 px icon; each event is plain text beside its marker (title, time, details), grouped by day | History, appeal outcome |
| **DiffView** | A bordered section per clause with an Added (success), Removed (error) or Changed (warning) badge and the change in words (field before -> after) | Policy compare and publish preview |
| **StatCard** | A plain bordered panel: a 12/16 label in the secondary colour, the number in the stat style, one line of detail in the tertiary colour | Metrics |
| **Avatar** | Round, 28, `surfaceContainer` fill, hairline, the initial in 12/16 weight 500 | Feed, top bar |
| **QueryState** | A wrapper: `isLoading` -> skeleton; `isError` -> ErrorState; empty -> EmptyState; otherwise the children | Used by every data view [UX-1] |

---

## 5. Layout and responsiveness

- **Breakpoints:** `xs 0, sm 600, md 840, lg 1200, xl 1600`.
- **Page padding:** 16 (compact), 24 (medium and up), on the sides and above the heading. Content starts next to
  the navigation, left-aligned, with a max width:
  - reading pages (feed, my content, history): **760**
  - form pages (policy): **960**
  - work pages (queue, case, appeals, audit, metrics): fluid; status up to 1600
- **Gutters:** 16 in list-detail at 840-1199, 24 from 1200; 12 between stacked panels and grid cards.
- **No horizontal scroll from 320 px.** Long words and URLs use `overflow-wrap: anywhere`. Chip rows scroll
  horizontally inside their own container. Tables become row lists below 840.
- **Sticky elements:** the top bar; the sidebar; the decision pane (supporting pane, when the detail is wide
  enough); the bottom bar on phones.
- **Targets:** see sec. 2.4. Hover-only information is also available on focus or tap.

### 5.1 Canonical layout per screen

| Screen | Compact (< 600) | Medium (600-839) | Expanded (840-1199) | Large and up (>= 1200) |
| --- | --- | --- | --- | --- |
| Queue -> case | List; tap opens the case full screen | Same | **List-detail**: list 360 + case | List 400 + case; the case shows a **supporting pane** (recommendation and decision panel 360, sticky) once the detail pane itself is >= 760 wide (a container query: with the sidebar and the list beside it, that is from about 1480 px) |
| Case detail | Single column, header row, decision panel at the end | Same | Single column in the detail pane, decision card at the end | Main column + sticky decision pane |
| Appeals -> review | List -> full-screen review, stacked panels | Same | List-detail; review shows the panels stacked | 2 columns (Original, Appeal) + Outcome full width below; **>= 1600: 3 columns** |
| Feed | Single column, composer at the top | Left-aligned, max 760 | Same | Same |
| Policy | Versions, clauses, compare, publish stacked | Same | Same, max 960 | Same |
| Audit | Row list | Row list | Table | Table |
| Metrics, Status | Cards in 1 column | 2 columns | 3 columns | 4 columns |

---

## 6. Screens

Each screen uses QueryState plus the states in sec. 7.

1. **Sign-in** `/sign-in`
   - A centred card (max 440), the one centred page: email and password fields with labels above; **Sign in**
     (primary, large).
   - **Demo accounts** (demo mode): a grid of bordered tiles, one per role, each with a monochrome icon, the role,
     the name, the address and a "Try:" hint; one click signs in.
   - A link to **System status**.
2. **Feed** `/feed`
   - Composer card: a multi-line field with a 0/2000 counter and a **Post** button (primary, large).
   - Posts as rows in one bordered panel: a 28 px avatar, the name (strong body) and relative time (meta) on one
     line, the body (body text), the visibility treatment (CNT-5), and ghost buttons **Comment** and **Report** in
     the secondary colour close under the body.
   - A labelled post carries a warning badge ("Warning: HAR-1"). A limited post shows a neutral banner, "This post
     has limited reach under SPAM-1." with **Show anyway** on the same row; once shown, the body carries a
     "Limited reach" warning badge.
   - Comments open inline as nested sections.
   - **Report** opens a bottom sheet (compact) or dialog with reason filter chips, an optional note and a Submit
     button.
   - After posting: snackbar "Posted - being checked against policy v1". The post shows an "Analysing..." badge
     for its author until the analysis finishes.
3. **My content** `/me`
   - Your items as bordered cards: the type and time, the author-words status badge (Being checked, Waiting for
     review, No issues found, Reviewed, Appeal pending, Appeal resolved), the action badge, the decision summary in
     plain words, a secondary **Appeal** button with "until 21 Nov" and a ghost **History** button.
   - The appeal form is a full-screen dialog on compact: statement (counter 20-2000), up to 3 evidence links, and a
     note.
   - Appeal state and outcome are shown inline as a nested section.
4. **History** `/content/[id]/history`
   - A timeline: created -> analysis v1 (staff: findings, AI run) -> decision -> appeal -> outcome -> re-analysis
     after a policy change. A decision made under an older policy carries a warning banner "Policy changed since
     this decision" with the version it stays under.
   - The author sees plain language and no AI internals or reporter identities.
5. **Queue** `/queue`
   - Search bar; a filter-chip row: Needs review (default), Analysing, Auto-cleared, High, Reported,
     AI unavailable, Policy v...
   - Rows in one bordered panel:
     - headline: the excerpt (2 lines)
     - supporting: a severity dot, then "High, Post, Alex, HAR-1, PII-1, 2 reports" (the severity in words first)
     - trailing: a priority badge ("P 85", error tint from 75) and the age ("12 m")
   - "Showing 20 of 54" and "Load more".
6. **Case** `/queue/[caseId]`
   - **Header row:** the status and priority badges on the left; secondary **Reopen for review** and
     **Re-analyse** buttons (leading icon) on the right. When the row wraps (phones), the buttons start the next
     line at the left edge, under the badges.
   - **Content card:** HighlightedText; parent post (for comments) as a nested section; report reasons (counts
     only).
   - **Findings card**, three groups under 12/16 group labels:
     - "Confirmed evidence": rule and verified-AI findings, each a nested section with the clause code, the
       evidence badge, the severity dot, quotes, the ConfidenceMeter with reasons and the clause text (a quiet
       disclosure)
     - "AI interpretation - not verified evidence"
     - "Dropped by verification": invalid clauses and unverified quotes, shown for transparency
   - **Recommendation card** (supporting pane): an "AI + rules suggestion" label; action badge; severity dot; AI
     state badge; clause codes; ConfidenceMeter; "**Why a human must decide**" as a nested list; policy version
     badge; "Analysis v3 of 3".
   - **Decision panel**, all large buttons:
     - **Approve recommendation** (primary)
     - **Modify** (secondary): opens action chips (disallowed actions disabled with a reason), clause chips, a
       reason category and a rationale, in a nested form
     - **Reject recommendation** (ghost, red only on hover and focus): reason and note
     - Submit shows progress. A 409 shows a banner: "This case was re-analysed (policy v2). Reload to see the
       latest analysis."
   - **Human decision** (once decided): who, when, the suggested and final actions, the rationale, and the
     "Policy changed since this decision" warning banner when a newer policy is active.
   - **Analysis versions** and **AI run details**: bordered disclosures.
   - Admin: the same view with no decision panel, plus a neutral banner "Read-only oversight".
7. **Appeals** `/appeals`: Waiting and Resolved filter chips; rows in one bordered panel with "Assigned to you"
   first, then waiting age. A warning banner shows when an appeal has no eligible reviewer.
8. **Appeal review** `/appeals/[id]`
   - **Original decision** panel: action, clauses, rationale, decider, policy version, evidence highlights.
   - **Appeal evidence** panel: the statement and links, plus the **AI summary** section ("does not recommend an
     outcome", new points, disputed findings).
   - **Outcome** panel: pending, or the result, plus the resolve form: Uphold, Overturn, Modify (filter chips),
     action (for modify), rationale.
   - The original decider sees "You made the original decision - another senior moderator must review this".
     Controls are disabled.
   - "Policy changed since decision" warning banner when applicable.
9. **Policy** `/policy`
   - **Versions:** one row per version with an Active (success) or Retired (neutral) badge, the date, clause count
     and notes, and a button to show its clauses; the shown version's row has the `selected` fill.
   - **Clauses** as a spec sheet, one clause per row with hairlines between them:
     - header: the clause code as a monospace badge, the title in strong body, and on the right, only when it
       applies, an amber 16 px icon with "Always to a human" (no fill)
     - the description as body text
     - a definition list (labels 12/16 in the secondary colour; two label-value columns from 840 px, stacked on
       phones): Severity (dot plus word), Default action (word), Allowed actions (comma-separated words), Rule
       signals (one plain line, for example "Keywords: worthless, idiot; 1 pattern")
   - **Compare** (two selects + DiffView).
   - **Publish** (admin), a 4-step flow shown with the **Stepper**: 1 Paste or upload JSON (a plain multi-line
     field; no editor dependency) -> 2 Validate (error list with JSON paths) -> 3 Review the diff and the impact
     ("12 unresolved cases will be re-analysed under v2") -> 4 Confirm dialog.
   - Then a re-evaluation progress card (linear progress, done/failed counts, **Retry failed**).
10. **Audit** `/audit`
    - An integrity banner ("Audit chain intact, 248 events verified" in success; when broken, an error banner with
      the first broken event and a **Show event** button that searches for it).
    - Filters (in the URL): actor type chips (People, System, AI), action and entity selects, a from/to date
      range. Search covers a person's name or email, the entity, the request ID and `#<event>`. A table from
      840 px, a row list below, "Showing 25 of 248" and **Load more**. A row expands to its details and the
      before/after JSON as plain text.
11. **Metrics** `/metrics`
    - Stat cards as plain bordered panels: agreement %, overrides, AI failure %, p50 latency, tokens and cost (24 h
      and 7 d).
    - Simple bar lists in the accent colour on a hairline track: override reasons, AI failures by reason, cost by
      day. No chart library.
12. **Status** `/status` (public, a 56 px white bar with a bottom hairline, the product name and **Sign in**)
    - The page heading with **Refresh** on the right.
    - An overall banner in the state's soft colour: "All systems operational", "Degraded: some checks need
      attention" or "Outage: at least one check is failing", with the time of the last check.
    - A grid of check cards (sec. 5.1). Each has a title, the state as a dot plus a word, and key-value details.
    - The release SHA (first 7 characters) on the App card. Auto-refresh every 30 s plus a **Refresh** button.
    - Admin only: a **Background jobs (admin)** panel with **Process pending jobs** (a snackbar with the runner
      summary) and the most recent failed jobs as nested sections, each with its last error and a secondary
      **Retry** button. The role is read on the client, so the page never waits for the database.
    - Timestamps show as local times ("7 Nov, 19:13") with the ISO value in the tooltip.
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
- Every input has a visible label above it. Errors are linked with `aria-describedby`, and focus moves to the first
  error.
- Keyboard: full tab order; arrow keys inside chip groups; `Esc` closes dialogs and sheets; focus returns to the
  trigger.
- Focus indicator: a 2 px accent ring, offset 2, always visible on `:focus-visible`; inputs show it as an accent
  border plus a 2 px ring.
- Text contrast >= 4.5:1 in both themes (sec. 2.1). Never colour alone: every dot, badge and icon sits next to a
  word.
- Touch targets on phones >= 44 px (sec. 2.4).
- Snackbars and progress use `aria-live="polite"`. Highlight marks have accessible names ("Evidence for HAR-1").
- Respect `prefers-reduced-motion` and `prefers-color-scheme`. Zoom to 200% works without loss.

---

## 9. MUI implementation notes

```ts
// src/ui/theme/theme.ts (sketch); shape and size constants live in src/ui/theme/layout.ts
createTheme({
  cssVariables: { colorSchemeSelector: 'class' },        // + <InitColorSchemeScript/> to avoid a flash
  colorSchemes: { light: { palette: paletteFrom(tokens.light) }, dark: { palette: paletteFrom(tokens.dark) } },
  breakpoints: { values: { xs: 0, sm: 600, md: 840, lg: 1200, xl: 1600 } },
  shape: { borderRadius: 6 },
  spacing: 4,                                              // 1 unit = 4 px; check-ui-rules relies on it
  typography: { h1: pageTitle, h2: sectionTitle, body1: body, caption: meta, overline: label /* sec. 2.3 */ },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiPaper:   { defaultProps: { elevation: 0 } },
    MuiCard:    { styleOverrides: { root: { borderRadius: 8, border: '1px solid <border>' } } },
    MuiButton:  { styleOverrides: { root: { borderRadius: 6, height: 32 }, sizeLarge: { height: 36 } } },
    MuiChip:    { styleOverrides: { root: { borderRadius: 6, height: 28 } } },
    MuiDialog:  { styleOverrides: { paper: { borderRadius: 8, border: '1px solid <border>' } } },
    MuiMenu:    { styleOverrides: { paper: { borderRadius: 8, border: '1px solid <border>' } } },
    MuiTextField:   { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiInputLabel:  { defaultProps: { shrink: true } },    // the label sits above the field
    MuiOutlinedInput: { defaultProps: { notched: false } }, // no notch: the border is a plain 1 px line
  },
});
```

- The role set lives under a custom `palette.m3` (with TypeScript module augmentation); MUI generates
  `--mui-palette-m3-*` CSS variables. Custom components use `theme.vars.palette.m3.*` only. **No hex values
  outside `tokens.ts`.** `layer(content, background, percent)` builds flat hover colours with `color-mix`.
- MUI's palette maps: `primary.main` = the accent; `background.default` = canvas, `background.paper` = card;
  `error`, `success`, `warning` from sec. 2.1; `text.primary` and `text.secondary` = the first two text levels;
  `divider` = border.
- `src/ui/components/Button.tsx` sets the primary, secondary and ghost colours; the theme sets shape, height and
  the phone touch-target extension (`::after`, 44 px).
- `scripts/check-ui-rules.mjs` fails on shadows, gradients, hex colours outside `tokens.ts`, raw px spacing,
  `dangerouslySetInnerHTML` and borders thicker than 1 px outside the theme.
- Use `@mui/material-nextjs` `AppRouterCacheProvider` in the root layout. Roboto is self-hosted.
