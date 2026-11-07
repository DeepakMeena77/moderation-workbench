# Agent usage

How AI coding tools were used to build this project, what they got wrong, and how the output was checked.

## Tools

| Tool | Used for |
| --- | --- |
| Claude Code (VS Code), planning chat | Requirements analysis, the docs in `docs/`, repository guards and hooks, reviewing every slice, merges, deployment and environment setup |
| Claude Code (VS Code), build chats | Implementing one slice at a time from a written brief (S0 to S9), on their own branches and git worktrees |
| `cc-open` | Starting and resuming the build chats from the planning chat, and watching their progress |
| Chrome DevTools Protocol (a separate automation Chrome profile) | Clicking through account setup (Neon, Vercel, Google AI Studio). Sign-ins with passwords were done by hand |
| Neon CLI, Vercel CLI and API | Database branches, environment variables per environment, deployments |
| Google Gemini | Runtime only: the AI reviewer inside the product |

## How the work was organised

- I chose the problem, the stack (Next.js + Postgres), the LLM provider (Gemini with a fallback), the design
  style (neutral and dense, no elevation or gradients) and the repository name, and set the rules: ASCII only, no secrets, no
  attribution in commits, nothing private in the repository.
- The planning chat turned the brief into numbered acceptance criteria (`docs/01`), a system design, a UI/UX
  spec, a slice plan and a test plan, and added guards that enforce them (`scripts/check-*.mjs`, git hooks).
- Each slice was briefed to a build chat with explicit scope, rules and checks. The planning chat reviewed the
  result (gate B: running every check itself, reading the risky code paths), committed, pushed, watched CI and
  merged. Build chats were not allowed to commit, push, deploy, read `.env` files or edit the guards.
- S0 and S1 used a plan-approval round before building. From S2 onward, to keep pace, build chats posted a short
  plan and built straight away, stopping only for genuine ambiguity; review happened after the build.
- From S2, two build chats worked in parallel on separate git worktrees, each with its own Neon test database.

## Representative prompts

| Prompt (short) | What came back | What was kept or changed |
| --- | --- | --- |
| "Read CLAUDE.md and every file in docs/. Tell me back what we're building, the invariants, the slice order and the git rules. List anything contradictory or risky. Don't change files." | A 24-point review of the docs (version pins, time bounds that did not fit the function limit, a job dedupe key that blocked re-analysis, an e2e step that could not prove SAME_REVIEWER) | All points settled in one docs commit before any code |
| "Start S0. File-by-file plan, exact commands, pinned versions; don't install anything yet." | A plan with exact pins and a scaffold workaround | Approved with one fix: `rm -rf` is blocked by the permission rules, use Node's rmSync |
| "Build S2 without waiting for plan approval ... content, case, job and audit event in one transaction ..." | Content, reports, rules, the job queue and the feed, 243 tests | Kept; a clock-skew bug was found and fixed |
| "S5: appeals ... route to a senior who did not decide ... the AI brief never recommends an outcome; make the resolution final in the database" | Appeals, the brief through the same bounded pipeline, a trigger that keeps resolutions final | Kept; its migration was renamed at review to sort after S6 and S7 |
| "Completeness pass: run check:trace --strict over all of docs/01 and build or justify every gap; read 02 and 03 against the code" | Missing job routes and admin panel, POL-4 notices, page-level access audit, 12 needs-human reasons documented | Kept; the release SHA link was dropped from the doc rather than adding two platform variables |
| "This is only the AI core of S3 ... pure code that S2 doesn't touch ... never call live Gemini in tests" | The bounded Gemini/mock pipeline with 217 unit tests | Kept; prices and the fallback model corrected after a pricing check |

## Agent mistakes and rejected suggestions

- **Wrong deadline.** The planning chat once stated the deadline as "today" when it was the next day, and
  briefly re-planned for a cut scope. Corrected from the portal timer.
- **Branch switch deleted local agent settings.** Merging S0 restored and then removed the git-ignored agent
  rules from disk. Restored from history; the build chat had only been planning at that point.
- **Secret shown in a log.** The redaction only knew the old `AIza...` Google key format; a new `AQ.` key was
  printed in a tool log. The key was deleted and replaced, and the secret scanner now matches the new format.
- **Guard false positive.** The private-document rule matched `analysis.ts`. Narrowed to upper-case Markdown or
  text note files, with a test of both cases.
- **Shared test database.** Two parallel branches shared a Neon test branch; one branch's migration broke the
  other's test. Every checkout now has its own database branch.
- **Flaky tests under load.** Rate-limit tests straddled a 60 s window boundary, and a component test exceeded
  5 s while other suites ran. Fixed by pinning the clock and raising the component timeout; no assertion was
  weakened.
- **Migration order across parallel branches.** S5 was built on an older base and named its migration with a
  timestamp earlier than S6's, which production had already applied. Caught at review and renamed so the
  history stays linear.
- **Doc drift.** The design listed a `reevaluation.finished` audit event that no code emits; the build chat
  flagged it and the event was removed from the doc rather than added as dead code.
- **Semantic merge conflict.** The e2e journey looked for the raw `access.denied` code on the audit page, while
  a parallel branch changed the page to show actions in words. Both branches passed alone; running the journey
  on the merged branch caught it before it reached `main`.
- **Checks that only passed on a quiet machine.** The pre-push verify failed with three build chats running:
  Prisma's 5 s interactive-transaction limit and user-event's per-key delay. The causes were fixed (15 s
  transaction limit for a cold or busy database, no timer between keystrokes in component tests); the hook was
  never skipped.
- **Duplicate work in parallel.** Both build chats wrote `combine.ts`; the AI-aware version was kept and the
  other branch's callers adapted.
- **Build chat findings that were kept:** a 665 ms clock skew between this PC and Neon (queue times now come
  from the database clock), MUI dialog shadows breaking the no-elevation rule, a trimming marker that made
  prompts larger, a server-side prompt-injection check, and keeping the model call out of database
  transactions.
- **Rejected:** forcing installs past peer-dependency warnings, upgrading to new major versions released a day
  earlier, and putting the S2 rate-limit timing fix into the assertions rather than the clock.

## How output was verified

- **Automated:** `npm run verify` (repo guard, ASCII, UI rules, lint, typecheck, unit, integration and component
  tests) on every slice, run by the build chat and again by the planning chat; `npm run test:ui` (axe, overflow,
  navigation variants, style audit); `check:trace` per slice; CI on every push; pre-commit and pre-push hooks.
- **Live:** after each deploy, `/api/health` and `/status` checked against the merged commit SHA; demo sign-in
  checked for every role; one live Gemini classification (HAR-1 confirmed, 4.4 s, about 0.0011 USD).
- **Secrets:** history scanned on every push; `.env` files git-ignored and blocked by name.

## Running log

Test counts are per branch: S3 to S7 were built on parallel branches, so a later slice can show fewer tests
until the branches were merged.

| Slice | Result | Verified by |
| --- | --- | --- |
| S0 | Scaffold, theme, logging, http wrapper, status page, CI | verify (85 tests), test:ui 13/13, CI, live /api/health |
| S1 | Sessions, demo sign-in, app shell | verify (171), test:ui 111, CI, live sign-in for each role |
| S2 | Content, reports, rules, job queue, feed | verify (243), test:ui 128 |
| S3 | AI core and job wiring | unit 217, verify (362), live smoke |
| S4 | Queue, case page, decisions | verify (412 after merging S3), test:ui 142 |
| S5 | Appeals, second review, AI appeal brief, My content, history | verify (468), test:ui 155, trace S5 8/8; migration renamed at review so it sorts after S6 and S7 |
| S6 | Policy versions, compare, publish, re-evaluation runs | verify (389), test:ui 139, trace S6: POL-2..5 covered |
| S7 | Hash-chained audit, access.denied, audit and metrics pages | verify (463), trace S7 8/8; one ui failure traced to leftover dev data, re-checked on a fresh database |
| S8 | Evaluation set and runner; cross-role e2e journey; screenshot script | live eval 20/21; e2e 12/12 at 1280 and 390 px; trace S8 6/6 |
| S9 | Job admin routes, policy-change notices, page access audit, docs aligned with code | verify (533), test:ui 202, e2e 12/12, `check:trace --strict` 65 covered, 5 manual, 0 missing |
