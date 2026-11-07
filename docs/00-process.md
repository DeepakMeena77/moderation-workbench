# 00 - Process and document map

How this project goes from requirements to a submitted, reviewable build, and which documents exist (and which
deliberately do not).

**Effort budget:** about 13 focused hours over two days.

---

## 1. Document map

Every document has one job. A reviewer, a coding agent or a new teammate should be able to find any fact in
**one** place.

### 1.1 Repository root (submission documents; keep the exact file names)

| File | Purpose | When it is written | Status now |
| --- | --- | --- | --- |
| `README.md` | Entry point: live link, demo logins, 5-minute demo, **acceptance criteria -> evidence table**, architecture, setup, tests, scope, limitations, deployment, post-deploy verification | Stub in S0, final in S9 | Created in S0 |
| `AGENT_USAGE.md` | How coding agents were used: tools, representative prompts, delegated work, mistakes caught, verification | **Running log from S0**, edited in S9 | Template created |
| `PROMPTS_USED.md` | The product's runtime prompts: versions, design choices, **real before -> after iterations**, malformed-output handling | **Running log from S3**, edited in S9 | Template created |
| `AI_NOTES.md` | The AI design in one page: model choice, output contract, every safeguard with file and test, failure modes, cost, eval results, release boundary | S9, from the system design and eval output | Created in S9 |
| `ABOUTME.md` | Who built it and why | Fill in personal details before submitting | Template created |
| `.env.example` | Variable names with safe placeholders | S0, extended per slice | Created in S0 |
| `CLAUDE.md` | Operating rules for the coding agent. It is also evidence of responsible agent use | Now | Created |

### 1.2 `docs/` (build documents; read in this order)

| File | Purpose | Main reader |
| --- | --- | --- |
| `00-process.md` | This file: the method, the document map, the agent workflow and the definition of done | You |
| `01-requirements.md` | Users, scope, **numbered acceptance criteria** (with failure cases), assumptions | You, the agent, the reviewer |
| `02-system-design.md` | Architecture, data model, state machines, AI pipeline, jobs, API, security, decisions (ADRs) | Agent, reviewer |
| `03-ui-ux.md` | Material 3 design system (tokens, components), navigation and responsive layout, screens, states, microcopy, accessibility | Agent |
| `04-build-plan.md` | Vertical slices S0-S9 in order, each with scope, acceptance criteria, tests, done checks and the prompt to give the agent | You and the agent |
| `05-test-plan.md` | Test types and how each is run, static checks (ASCII, UI rules), **acceptance criterion -> test traceability**, UI/UX quality tests, eval set, e2e journey, manual and post-deploy checks | You and the agent |
| `trace.md` | *Generated* by `npm run check:trace`: criterion -> tests -> status. Copied into the README in S9. | Reviewer |
| `RELEASE_NOTES.md` | *Written in S9:* what was released, checks performed, limits, recovery, owner | Reviewer |
| `screenshots/` | *Written in S8:* Playwright screenshots at 360 px and 1280 px | Reviewer |

### 1.2a Tooling that enforces the docs (`scripts/`, `.githooks/`)

| File | Enforces |
| --- | --- |
| `scripts/check-ascii.mjs` | Every tracked text file is 7-bit ASCII (code, docs, prompts, test data) |
| `scripts/check-ui-rules.mjs` | Design-system rules: no shadows, no hex outside tokens, no raw HTML, theme spacing, no outlined buttons, no borders on surfaces |
| `scripts/check-trace.mjs` | Every acceptance criterion has a test named with its ID |
| `scripts/check-repo.mjs` | Only allowlisted paths may be tracked; private and planning files, PDFs, logs, env files and machine paths are rejected; terms in the git-ignored `.repo-guard.local` may not appear |
| `scripts/check-secrets.mjs` | No API keys, database passwords, tokens or private keys in staged content, tracked files or history |
| `.githooks/pre-commit` | Repo guard, secrets, ASCII and UI rules on the staged files |
| `.githooks/pre-push` | Repo guard, secrets across the full history, ASCII, then `npm run verify` |
| `.claude/settings.json` | Coding-agent permissions: no git write commands, no deploys, no reading `.env`, no editing the guards, hooks or `ABOUTME.md` |

### 1.2b Git workflow

- **Branches:**
  - `main` always holds a deployable state
  - one branch per slice (`s0-foundations`, `s3-ai-layer`, ...), merged into `main` with `--no-ff` after the
    slice's gates pass
  - Vercel deploys `main` to production and branches to previews
- **Commits:** small, Conventional Commits style (`feat(appeals): route to a different senior moderator`,
  `test(ai): bounded repair loop`, `docs: ...`). One concern per commit.
- **Who commits:** only the human. The coding agent may run read-only git (`status`, `diff`, `log`, `show`).
  Every write command is denied in `.claude/settings.json`.
- **Before every commit:**
  1. `git status` shows only files the slice plan named
  2. review `git diff --staged`
  3. the hooks run automatically
- **Never** use `git add -A` blindly after a scaffold or generator: add paths explicitly, or check `git status`
  first. Never use `--no-verify`.
- **Before submitting:**
  - `node scripts/check-repo.mjs`
  - `node scripts/check-secrets.mjs --history`
  - a fresh clone into a temporary folder: `npm ci && npm run verify` passes there too

### 1.3 Documents deliberately **not** created

| Not created | Why |
| --- | --- |
| Separate PRD, SRS and user stories | Merged into `01-requirements.md`. Several overlapping requirement files drift apart, and readers trust only one. |
| `docs/API.md` | The API table lives in `02-system-design.md` sec. 7 next to the services it calls. The README links to it. |
| An ADR folder | Ten short ADRs fit inline in `02-system-design.md` sec. 12. |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `PLAN.md`, `AGENT_LOG.md` | The git history, `04-build-plan.md` and `AGENT_USAGE.md` already cover them. Extra files dilute the signal. |
| A long README API reference | A very long README hides the evidence a reader is looking for. The README stays at about 300 lines or fewer and links to details. |

---

## 2. Phases

```
1 Requirements -> 2 System design -> 3 UI/UX -> 4 Build in slices (S0-S8) -> 5 Test (continuous + final) -> 6 Docs and release (S9) -> 7 Submit
```

| Phase | Output | Gate before moving on |
| --- | --- | --- |
| 1. Requirements | `01-requirements.md` | Every line of the brief and every quality goal maps to an acceptance-criterion ID |
| 2. System design | `02-system-design.md` | Each acceptance criterion has a home (service, table, route, job) |
| 3. UI/UX | `03-ui-ux.md` | Each acceptance criterion with a UI has a screen and its loading, empty, error, validation and success states |
| 4. Build | Working slices, deployed after each one | The slice's done checks pass **on the live URL** |
| 5. Test | Unit, integration, component, e2e and eval | `npm run verify` is green locally and in CI |
| 6. Docs and release | README, AI_NOTES, PROMPTS_USED, AGENT_USAGE, ABOUTME, RELEASE_NOTES | Doc checklist in sec. 5 |
| 7. Submit | Form submitted | Private-window run at 360 px and desktop; remarks pasted |

**Rule: ship one useful workflow before building the whole system.** Deploy at S0, and keep the live URL working
after every slice.

---

## 3. AI-assisted coding workflow (repeat for each slice)

1. **Brief.** Start a fresh agent session. Give it `CLAUDE.md`, the slice section of `04-build-plan.md`, and the
   referenced sections of `01`, `02` and `03`. Use the prompt in the slice section.
2. **Plan first.** Ask for a file-by-file plan **before** any code. Reject plans that:
   - add dependencies not listed in `02 sec. 1`
   - change the data model without updating `02`
   - skip tests
3. **Implement in small diffs.** One concern per step: schema, then service, then route, then UI, then tests.
4. **Review every diff yourself.** Check:
   - the invariants in `CLAUDE.md`
   - error handling
   - names
   - no secrets
   - no dead code
   - no silent `catch`
5. **Verify.** Run `npm run verify`, click through the slice in the browser at 360 px and at desktop width, then
   deploy and repeat on the live URL.
6. **Log.** Write one line in the `AGENT_USAGE.md` log: prompt, what came back, what you changed, any mistake
   caught. Prompt changes go in `PROMPTS_USED.md`.
7. **Commit yourself.** Follow sec. 1.2b. The agent never commits.

**Stop the agent and redirect when it:**

- builds UI before the service exists
- works around a failing test instead of fixing it
- edits files outside the slice
- invents requirements
- weakens an invariant "to make it work"

---

## 4. Definition of done (every slice)

- [ ] The slice's acceptance criteria are met, and each has a test whose name starts with the criterion ID
      (for example `it('[APP-3] ...')`).
- [ ] Loading, empty, error, validation and success states exist for every new view and form.
- [ ] It works at 360 px with no horizontal scroll, works at 1280 px, and is usable by keyboard.
- [ ] `npm run verify` (ASCII check, UI-rules check, lint, typecheck, test) is green, and CI is green.
- [ ] For UI slices: `npm run test:ui` is green (axe, overflow, navigation variant, style audit).
- [ ] `npm run check:trace -- --slice <Sx>` shows every criterion of the slice as covered.
- [ ] It is deployed, and checked on the live URL.
- [ ] Logs show the new events with a `requestId`. No secrets or full content text appear in logs.
- [ ] `AGENT_USAGE.md` log updated (and `PROMPTS_USED.md` if a prompt changed).
- [ ] Committed.

---

## 5. Final documentation checklist (S9)

- [ ] README <= ~300 lines.
- [ ] Live link, demo logins and `/status` link in the first screen of text.
- [ ] Acceptance table with every criterion marked passed, unresolved or excluded, each with evidence.
- [ ] AI_NOTES has a file path and test name for every safeguard, plus eval results and token and cost figures
      from a live run.
- [ ] PROMPTS_USED contains **only real** iterations, with evidence.
- [ ] AGENT_USAGE lists mistakes and rejected suggestions honestly.
- [ ] ABOUTME is filled in by you.
- [ ] `.env.example` has no real values. Scan the history: `git log -p | grep -iE "AIza|postgres://[^<]"`.
- [ ] RELEASE_NOTES has the post-deploy checks with date, result and owner.
- [ ] Screenshots are committed.
- [ ] `npm run check:trace -- --strict` passes (manual criteria listed with their evidence).
- [ ] Slides PDF on public Google Drive, in case the form asks for a presentation link.
