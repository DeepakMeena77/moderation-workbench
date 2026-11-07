# 04 - Build plan (vertical slices)

Each slice ends **deployed and demonstrable**. Work through them in order. Use the per-slice loop in
`00-process.md` sec. 3. Acceptance-criterion IDs refer to `01-requirements.md`.

## Schedule (deadline 8 Nov, about 20:58 IST; target submit 20:00)

| Slice | Content | Estimate | Planned window |
| --- | --- | --- | --- |
| S0 | Scaffold, tooling, CI, database, theme, `/status` stub, **first deploy** | 1.5 h | 7 Nov 13:30-15:00 |
| S1 | Auth, demo sign-in, app shell and responsive navigation | 1.25 h | 15:00-16:15 |
| S2 | Policy, content, reports, rules, cases, job queue | 1.5 h | 16:15-17:45 |
| S3 | AI layer + analysis job + combine | 2.5 h | 18:00-20:30 |
| S4 | Queue, case page, decisions | 2 h | 20:30-22:30 |
| S5 | My content, history, appeals, second review | 1.5 h | 8 Nov 08:00-09:30 |
| S6 | Policy publish, diff, re-evaluation | 1.5 h | 09:30-11:00 |
| S7 | Audit page, metrics, full status page | 1.5 h | 11:00-12:30 |
| S8 | Eval set, e2e, screenshots, states and mobile polish | 2 h | 12:30-14:30 |
| S9 | Docs, release notes, slides, live verification, submit | 3 h | 14:30-17:30 (+ buffer to 20:00) |

**If you fall behind,** cut in this order: hash chain (AUD-3) -> metrics charts (keep the numbers) -> Playwright
screenshots (keep the one journey test) -> the policy JSON upload (keep paste). **Never cut:** the status page,
AI robustness, human-control tests, or the S9 docs.

---

## S0 - Foundations and first deploy

**Scope:**

- Next.js + TypeScript (strict), ESLint, Prettier, Vitest, Playwright installed
- MUI with the M3 theme from `03-ui-ux.md` sec. 2 and sec. 9
- Prisma + Neon; `config.ts` (Zod-validated environment), `logger.ts`, `errors.ts`, the `http.ts` handler wrapper
- `GET /api/health` and a minimal `/status` page (app release and database check)
- CI workflow; `.env.example`; README stub
- Deploy to Vercel

**Note.** `create-next-app` refuses a folder that already contains files such as `CLAUDE.md`. Scaffold into
`./_scaffold` and move its contents up, or scaffold elsewhere and copy:

```bash
npx create-next-app@latest _scaffold --ts --eslint --app --src-dir --import-alias "@/*" --no-tailwind --use-npm
```

Then:

1. The repository already exists: git is initialised and the hooks are active. **Do not** move the scaffold's
   `.git`, `.gitignore`, `README.md` or any `AGENTS.md`/`CLAUDE.md` it generates. Report any `.gitignore`
   entries ours lacks, and the human adds them.
2. Move the remaining scaffold files to the root. Delete `_scaffold` (it is git-ignored, so leftovers cannot be
   committed).
3. Run `node scripts/check-repo.mjs`. Every new path must be on the allowlist. Report any that are not, and do
   not rename things to get around it.
4. Run `npm run check:ascii`. The scaffold's own files must pass too. Replace any non-ASCII characters it
   generated (fonts and favicons are binary and are skipped).

**Scripts** (`package.json`):

- `dev`, `build`, `start`
- `lint`, `typecheck`
- `check:ascii` = `node scripts/check-ascii.mjs`
- `check:ui` = `node scripts/check-ui-rules.mjs`
- `check:trace` = `node scripts/check-trace.mjs`
- `check:repo` = `node scripts/check-repo.mjs`, `check:secrets` = `node scripts/check-secrets.mjs --history`
- `test` (vitest projects: unit, integration, components), `test:e2e` (Playwright `e2e` project), `test:ui`
  (Playwright `ui` project)
- `verify` = check:repo + check:ascii + check:ui + lint + typecheck + test
- `db:migrate`, `db:seed`
- `eval`

**Also in S0:**

- `tests/unit/tokens.contrast.test.ts` (05 sec. 6.1). It runs from the first token commit, so a bad colour can
  never land.
- The Playwright config with two projects (`e2e` and `ui`) and the `@axe-core/playwright` helper, plus one UI
  test for `/status`: axe, no overflow at 320 and 1280, and the style audit. Every later page joins the same
  matrix.

**Acceptance:** OPS-2, OPS-5 (a first deploy), DOC-4 (CI green), UX-4 (theme in place).

**Done when:**

- `npm run verify` is green, and the pre-commit hook blocks a planted non-ASCII character (try it once)
- `npm run test:ui` is green for `/status`
- the live `/api/health` returns `{ ok: true, db: "connected" }`
- `/status` shows App and Database in green with the commit SHA
- the CI badge is green

**Agent prompt:**

> Read `CLAUDE.md`, `docs/02-system-design.md` sec. 1-2, sec. 10 and sec. 13, and `docs/03-ui-ux.md` sec. 2 and sec. 9. Implement
> slice S0 from `docs/04-build-plan.md`. First give me a file-by-file plan and the exact commands, and wait for
> my OK. Use only the dependencies allowed in 02 sec. 1. Put the M3 tokens in `src/ui/theme/tokens.ts` exactly as
> listed in 03 sec. 2.1. No business features yet.

---

## S1 - Auth, demo sign-in, app shell

**Scope:**

- `User` model and seed (6 demo users)
- sign-in, sign-out and `me` routes; the `jose` session; `getActor()`; role guards for pages (middleware plus a
  layout check) and APIs
- the demo sign-in cards and the "Switch demo user" menu (`DEMO_MODE`)
- **the app shell**: top app bar, navigation **bar (< 600), rail (600-1199), drawer (>= 1200)**, role-based
  destinations, the "More" sheet, theme toggle
- shared components: Button styles, Tag, QueryState, EmptyState, ErrorState, Skeletons, SnackbarProvider

**Acceptance:** SEC-1, UX-2 (navigation part), UX-3 (shell), UX-5.

**Tests:**

- `[SEC-1]` unauthenticated API requests get 401; the wrong role gets 403
- the role is re-read from the database (change the role, and the next request reflects it)
- a component test that the navigation renders the right destinations per role

**Done when:** on the live URL, one-click sign-in works for every role; the navigation changes correctly at 360,
700, 1000 and 1300 px; keyboard navigation reaches every item.

**Agent prompt:**

> Read `CLAUDE.md`, 01 sec. 2, 02 sec. 10 (sessions and the handler wrapper), and 03 sec. 3-sec. 5. Implement S1. Build the navigation as
> `src/ui/components/AppShell` with three variants chosen by `useMediaQuery` against the M3 breakpoints, and the
> destinations taken from one config table keyed by role. Plan first and wait for my OK.

---

## S2 - Policy, content, reports, rules, cases, jobs

**Scope:**

- `policies/policy.v1.json` and `v2.json` (02 sec. 4); the policy Zod schema; seed v1 as active; the partial unique
  index migration
- `Content`, `Report`, `Case`, `Job`, `AuditEvent` (append without the hash chain for now) models
- services: `content.create` and `comment` (one transaction: content + case + job + audit); `reports.create`
- rules (`keyword`, `pattern`, `links`, `contact`, `repeat`), unit-tested
- the job queue and runner (02 sec. 6) with a temporary handler that stores **rule-only** analyses
- the Feed page: composer, post cards, comments, report sheet, visibility treatments
- database rate limits for posting

**Acceptance:** CNT-1, CNT-2, CNT-3, CNT-5, DET-1..5, POL-1, OPS-4 (claim, lease, retry), SEC-4 (posting),
AUD-1 (for these events).

**Tests:**

- one per rule
- `[CNT-1]` validation (empty, too long)
- `[CNT-3]` duplicate report 409, cannot report own content, report joins the open case and raises priority
- `[OPS-4]` a stuck job is re-claimed after the lease expires; attempts are capped
- `[POL-1]` a second active policy is rejected by the database

**Done when:** a post on the live site gets a rule-only analysis within seconds, with no manual action.

---

## S3 - AI layer (the core of the product)

**Scope:**

- `ai/provider.ts` (interface), `gemini.ts`, `mock.ts` (with every marker in 02 sec. 11)
- `prompts/classify.v1.md` with a version and hash loader
- `budget.ts` (context ceiling and trimming)
- `parse.ts` (the ladder)
- `output.ts` (the Zod contract)
- the repair call
- retries, timeout, deadline, pacing, the fallback model
- `verify.ts`, `cost.ts`, `AiRun` logging, and `moderation/combine.ts` + `priority.ts`
- the real analysis job (rules + AI -> Analysis `seq+1`, status, priority, audit)
- the insert-only triggers migration (AUD-2) for `Analysis` and `AiRun`

**Acceptance:** AI-1..11, DET-5, Q-2, AUD-2 (partial).

**Tests (each named with its ID):**

- **parse ladder:** `direct`, `fenced`, `embedded`, `repaired`, `empty` and `json` failures
- **repair:** `[mock:repair]` succeeds on the second call; `[mock:invalid]` stops after exactly 1 repair -> `invalid_output`
- **retries:**
  - 429 retried with back-off that never exceeds the cap
  - 400 makes exactly 1 call
  - `[mock:404]` -> fallback model used
  - timeout honoured even when the provider ignores the abort signal
  - the deadline stops new attempts
- **verify:** an unknown clause is removed; a fake quote -> interpretation with confidence <= 0.5; a disallowed
  action is lowered and never raised
- **combine:** every AI-6 reason; auto-clear only in the AI-7 conditions; `alwaysEscalate` gives priority 100
- **budget:** an oversized context is trimmed, the content is never trimmed, and `trimmedContext` is recorded
- **cost:** computed from usage including thinking tokens
- **injection:** `[AI-8]` the injection text still needs a human
- **hard rule:** `[HUM-1]` an analysis never changes visibility

**Done when:**

- on the live site with real Gemini, `You are a worthless idiot` gives a HAR-1 confirmed finding with the quote
  highlighted (in S4) and an `AiRun` with tokens and cost
- forcing a bad model name shows the fallback model working

**Start `PROMPTS_USED.md` iterations here:** save the first prompt, every change, and why.

**Agent prompt:**

> Read `CLAUDE.md` and 02 sec. 5 in full (bounds table, ladder, verify, combine) and 01 AI-1..AI-12. Implement S3
> with all bounds read from config. The AI module must not import services or visibility code. Write the tests
> listed in 04 S3 first (red), then implement until they pass. Plan first and wait for my OK.

---

## S4 - Queue, case review, decisions

**Scope:**

- `GET /api/cases` (filters, search, cursor pagination, URL-synced) and `GET /api/cases/:id`
- the Queue page (search bar, filter chips, rows) with **list-detail at >= 840**
- the Case page (03 sec. 6.6): HighlightedText, findings groups, recommendation card with "why a human must
  decide", decision panel (approve, modify, reject), analysis versions, AI run details
- `visibility.ts` + the **content visibility trigger** migration
- `decisions.decide()` (02 sec. 8)
- re-analyse and reopen
- the `Decision` insert-only trigger

**Acceptance:** HUM-1..7, Q-1, Q-3, Q-4, AI-5 (shown in UI), AI-10 (shown in UI), UX-1 for these pages.

**Tests:**

- `[HUM-2/3/4]` each decision kind and its validation
- `[HUM-5]` the policy version and the recommended vs final action are stored
- `[HUM-6]` stale analysis 409 and already decided 409
- `[HUM-7]` admin 403
- `[HUM-1]` `setVisibility` refuses a system actor; a direct `UPDATE` without the session flag is refused by the
  database; lint blocks the AI import
- components: DecisionForm validation; HighlightedText renders `<script>` as text [SEC-3]

**Done when:** the moderator journey works end to end on the live site at 360 px and on desktop.

---

## S5 - Author view, history, appeals

**Scope:**

- `GET /api/me/content`; the My content page
- the history endpoint and page (author view vs staff view)
- appeal create (routing to a senior who is not the decider)
- the `appeal_brief` job (`prompts/appeal-brief.v1.md`, the same AI pipeline)
- the appeals list and the appeal review page (3 panels + resolve)
- `appeals.resolve()`

**Acceptance:** APP-1..5, AI-12, CNT-4, SEC-2.

**Tests:**

- `[APP-1/2]`: author only, once, within the window, action not `none`
- `[APP-3]`: routed to a different senior; the decider gets `SAME_REVIEWER`
- `[APP-5]`: overturn restores visibility; modify sets the new action
- `[AI-12]`: the brief schema has no outcome field
- `[SEC-2]`: author B cannot read A's history or appeal A's decision

---

## S6 - Policy versions and re-evaluation

**Scope:**

- the policy list and detail; `policyDiff` and the compare page
- validate and publish (admin) as a 4-step flow
- the `ReevaluationRun` with progress polling and retry-failed
- the "policy changed since decision" banner

**Acceptance:** POL-2..5.

**Tests:**

- `[POL-3]` only unresolved cases are re-analysed
- each re-analysed case gets a new analysis `seq`, with the old ones kept
- a moderator deciding on the old analysis gets 409
- publishing is idempotent (`POLICY_UNCHANGED`)
- a failed item can be retried
- the v2 SPAM threshold changes the outcome

---

## S7 - Audit, metrics, status

**Scope:**

- the hash chain + `/api/audit/verify` + the audit page (filters, table or list, integrity banner)
- `access.denied` events
- the metrics service and page
- **the full `/status` page** (02 sec. 11), including job health, the LLM state, AI usage, the release SHA
- Process pending and Retry job buttons

**Acceptance:** AUD-1..5, OPS-1, OPS-3, OPS-6.

**Tests:**

- `[AUD-2]` UPDATE and DELETE are refused on audit, decision, analysis and AI-run rows
- `[AUD-3]` tampering with one row breaks `verify` at that ID
- `[OPS-1]` the status payload shape, and the job-stuck state turns red

---

## S8 - Evaluation, e2e, polish

**Scope:**

- `evals/cases.json` (05 sec. 5) and `evals/run.ts` (`npm run eval`, and `-- --mock` in CI)
- Playwright `e2e`: the main journey (author posts -> moderator decides -> author appeals -> senior resolves),
  at 1280 and 390 px
- Playwright `ui`, the full suite from 05 sec. 6 on every page:
  - axe in light and dark mode
  - overflow at 320-1920
  - navigation variants
  - target sizes
  - style audit
  - focus
  - reduced motion
  - text spacing
  - long content
  - screenshots to `docs/screenshots/`
- the manual pass from 05 sec. 6.7 and sec. 9 (hierarchy, microcopy, NVDA, a real phone)

**Acceptance:** EVAL-1, EVAL-2, UX-1..4.

**Done when:**

- a **live** `npm run eval` against Gemini has been run, and its table saved for `AI_NOTES.md`
- `npm run test:ui` is green with 0 serious or critical axe violations

---

## S9 - Documentation, release, submit

1. `README.md` (<= ~300 lines):
   - live link, demo logins, `/status` link
   - the 5-minute demo script
   - **the acceptance -> evidence table** (copy 01 sec. 5, fill in Evidence, mark passed, unresolved or excluded)
   - architecture (the diagram from 02), setup, tests, scope, limitations and release boundary, deployment
   - the post-deploy verification log
2. `AI_NOTES.md`:
   - model choice; deterministic vs AI responsibilities; the output contract
   - **a safeguards table (safeguard -> file -> test)**
   - the bounds table, failure modes, real token and cost numbers, eval results
   - the release boundary ("drafts recommendations under human review; not for unattended action")
   - what AI was used for while building, and what you checked yourself
3. `PROMPTS_USED.md`: finish the runtime prompt table and the **real** iterations log.
4. `AGENT_USAGE.md`: finish from the running log (mistakes, rejected suggestions, verification).
5. `ABOUTME.md`: fill it in yourself.
6. `docs/RELEASE_NOTES.md`: what is released, checks run on the live URL (05 sec. 7), results, known limits,
   recovery steps, owner.
7. Secrets scan of the full history. Re-seed production if needed. Run 05 sec. 7 on the live URL in a private window.
8. Slides (6-8) as a PDF on public Google Drive.
9. Submit with the remarks text below.

**Remarks template:**

```
Live: <url> | Status: <url>/status | Repo: <github url>
Demo sign-in: one click on the sign-in page (author, author2, moderator, senior, senior2, admin).
Password for manual sign-in: <DEMO_PASSWORD> (test accounts only).
5-minute path: Author posts "You are a worthless idiot" -> Moderator: Queue -> case -> Approve/Modify ->
Author: My content -> Appeal -> Senior: Appeals -> resolve (the original decider is blocked) ->
Admin: Policy -> Publish v2 -> watch re-evaluation -> Audit (chain verified) -> /status.
Docs: README (acceptance -> evidence table), AI_NOTES.md, PROMPTS_USED.md, AGENT_USAGE.md, ABOUTME.md.
Known limits: see README sec. Limitations. AI runs on the Gemini free tier with a fallback model; if the quota
is hit, items show "AI unavailable" and stay with humans.
```
