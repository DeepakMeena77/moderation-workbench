# CLAUDE.md - rules for coding agents in this repository

**Content Moderation and Appeals Workbench.** An AI-assisted text moderation app. **The AI recommends; humans
decide.**

Before any change, read the relevant sections of:

| File | Contents |
| --- | --- |
| `docs/01-requirements.md` | Acceptance criteria (IDs such as `HUM-1`, `APP-3`) |
| `docs/02-system-design.md` | Architecture, data model, AI pipeline, bounds, API |
| `docs/03-ui-ux.md` | Material 3 design system, navigation, screens, states |
| `docs/04-build-plan.md` | The current slice: scope, tests, done checks |
| `docs/05-test-plan.md` | Test levels and naming |

If the docs and the code disagree, **stop and ask**. Do not guess.

## Workflow

1. **Plan first.** List the files to create or change, the tests to write and the commands to run. Wait for
   approval.
2. Implement in small steps: schema -> service -> route -> UI -> tests. Stay inside the current slice.
3. Run `npm run verify` (repo guard, ASCII check, UI rules, lint, typecheck, tests) before saying a step is done. Report failures as they are.
   Never weaken, skip or delete a test to make it pass.
4. **Never commit, push or deploy.** The human does that. Read-only git (`status`, `diff`, `log`, `show`) is fine.
   Write commands are denied in `.claude/settings.json`. Do not try to work around that.
5. Never add a dependency outside `docs/02-system-design.md` sec. 1 without asking first, with a reason.
6. If a change alters behaviour described in `docs/`, update that doc in the same change.
7. **Only create the files your approved plan lists.**
   - No extra docs, notes, plans, logs, scratch files or summaries in the repo.
   - Temporary files go in your system temp folder and are deleted afterwards.
   - At the end of each step, list every created, changed or deleted file.
8. Never touch `.githooks/`, the `scripts/check-*.mjs` guards, `.claude/`, `.gitignore` or `ABOUTME.md`. If one
   of them seems to block legitimate work, stop and explain why.
9. End every step with: the list of touched files, the check results, and a one-line draft for the `AGENT_USAGE.md` log (the human writes the log; do not edit `AGENT_USAGE.md`).
10. Run one command per shell call where you can; long chained commands are harder to review and may be denied.
11. Never read, print or create `.env` files. Ask the human to set values; use `.env.example` for names only.

## Invariants (never break these; each one has a test)

- **Only `src/server/services/visibility.ts#setVisibility` changes `Content.visibility`.** It requires a human
  moderator or senior moderator actor. Code under `src/server/ai`, `src/server/rules`, `src/server/moderation`
  and `src/server/jobs` must never import it, or the decision and appeal services. [HUM-1]
- The AI never resolves cases or appeals. AI output schemas contain **no** approve, decide, status or outcome
  fields. Unknown keys are stripped. [HUM-1, AI-12]
- **The server, not the model, decides `needsHuman`** (`moderation/combine.ts`). [AI-6]
- Every state change and its audit event happen **in one transaction** (`audit.append(tx, ...)`). [AUD-1]
- `AuditEvent`, `Decision`, `Analysis` and `AiRun` are **insert-only**. Re-analysis creates a new `Analysis`
  (`seq + 1`); it never overwrites. [AUD-2, POL-3]
- Every decision stores `analysisId` and `policyVersion`. Deciding on an outdated analysis returns 409
  `STALE_ANALYSIS`. [HUM-5, HUM-6]
- Appeals are resolved only by a senior moderator who is **not** the original decider. [APP-3]
- Every AI call goes through the bounded pipeline (budget -> provider chain -> parse ladder -> Zod -> at most 1
  repair -> verify) and writes an `AiRun` with tokens and cost, whether it succeeds or fails. All bounds come from
  `config.ts`. [AI-9, AI-10, AI-11]
- User content inside prompts is wrapped in escaped tags and treated as data. [AI-8]

## Code conventions

- TypeScript strict. No `any` (use `unknown` and narrow). Zod for all external input: requests, environment,
  policy files, AI output.
- Route handlers are thin: use the `http.ts` wrapper (requestId, auth, Zod, error mapping) and call one service.
  No Prisma calls in route handlers.
- Errors: throw `AppError(code, message, details?)` with codes from `docs/02-system-design.md` sec. 7. Never swallow
  an error silently; log it with context.
- Logs: pino through `logger.ts`. Event names look like `ai.call` and `decision.created`. Always include
  `requestId`. **Never log** content text (only length and hash), secrets, cookies or passwords.
- Names: files `camelCase.ts`; React components `PascalCase.tsx`. Business code goes in `src/server/services`
  and pure logic in `src/server/{rules,ai,moderation}`.
- Comments explain *why*, not *what*. No commented-out code, no TODOs without a slice reference.

## UI conventions (Material 3, no elevation)

- Use only the components in `src/ui/components` and the theme in `src/ui/theme`. **No hex colours outside
  `tokens.ts`.**
- No shadows (`elevation 0`, `boxShadow: 'none'`). No borders on cards: use tonal surfaces (`canvas`, `card`,
  `cardNested`).
- Buttons are pill-shaped (filled, tonal or text; no outlined buttons). Chips are radius 8 and height 32. Tags
  are radius 6 and height 24.
- Navigation: bar below 600 px, rail from 600 to 1199 px, drawer at 1200 px and up. The two-pane list-detail
  layout starts at 840 px.
- Every data view uses `QueryState` (loading, empty, error). Every form shows validation, progress and success
  or failure. Typed input is never lost on error.
- Render all user and AI text as plain text. **Never use `dangerouslySetInnerHTML`.**
- Keyboard accessible, visible focus ring, labels on all inputs, `aria-live` for snackbars. Works at 360 px with
  no horizontal scroll.

## ASCII only

- Every text file in this repository (code, comments, docs, prompts, JSON, test data, UI copy) is **7-bit
  ASCII**. `npm run check:ascii` and the pre-commit hook enforce it.
- Use `-` not dashes, `->` not arrows, `...` not an ellipsis character, straight quotes, `>=` and `<=`, and an
  icon instead of a check-mark character.
- Test data that must contain emoji, accents or other scripts uses unicode escapes in string literals, so the
  file itself stays ASCII.

## Tests

- Name each test with its acceptance-criterion ID: `it('[APP-3] ...')`.
- UI work also passes `npm run test:ui`: axe in both themes, no overflow from 320 to 1920 px, the right
  navigation variant, and the style audit. Our components set `data-ui="card|button|chip|tag|search|section|stack"`
  on their root so the audit can find them.
- Unit tests for pure logic. Integration tests against real Postgres with the **mock** AI provider. Never call
  the live Gemini API in tests.
- New behaviour gets a test in the same change, and so does each failure path (validation, 403, 409, AI failure).

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local app |
| `npm run verify` | Repo guard, ASCII check, UI-rules check, lint, typecheck and tests |
| `npm run test:e2e` | Playwright journey |
| `npm run test:ui` | Playwright UI quality suite (axe, layout, style audit) |
| `npm run check:trace -- --slice S3` | Which acceptance criteria of a slice have tests |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:seed` | Seed demo users, policy v1 and content |
| `npm run eval` | AI eval (live; add `-- --mock` for offline) |

## Secrets

- `.env` is git-ignored. `.env.example` holds names and placeholders only.
- Never print, log or paste keys. If a secret appears in a diff, stop and tell the human.
