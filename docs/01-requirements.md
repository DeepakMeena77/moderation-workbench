# 01 - Requirements and acceptance criteria

The source of truth for **what** to build. Every line of the problem statement, the "Expected solution" box, the
repository requirements, and the project's own quality and operability goals maps to an acceptance-criterion ID
below. Tests are named after these IDs (`[APP-3] ...`). The README's evidence table is built from this list.

---

## 1. Problem statement (verbatim)

> Build a text-content moderation application that uses a provided policy with versioned rules.
>
> **Supported content:** posts, comments, user reports, moderation history
>
> **AI agent:**
>
> - classify possible policy violations
> - cite the exact policy clause behind every finding
> - distinguish confirmed evidence from uncertain interpretation
> - propose a moderation action
> - explain severity and confidence
> - identify when human judgment is required
>
> **Application requirements:**
>
> - combine deterministic checks with AI review
> - support moderator approval, rejection, or modification
> - preserve the policy version used for each decision
> - create a moderation queue
> - allow the content author to submit an appeal
> - route appeals for a second review
> - show the original decision, appeal evidence, and final outcome
> - re-evaluate unresolved items when the policy changes
> - maintain a complete audit trail
>
> **The AI must not remove content or reject appeals without human approval.**
>
> **Not required:** image or video moderation, real social-network integration, automated account bans, or
> unrestricted user-generated content.

**Expected solution:**

- a usable frontend, working backend and basic persistence
- a functional AI workflow with human review for important AI actions
- clear loading, empty, validation, success and failure states
- focused tests, useful logs, deployment and documentation

**Repository:**

- `README.md` (setup, architecture, scope, tests, limitations, deployment)
- `AGENT_USAGE.md` (tools, prompts, delegated work, mistakes, verification)
- `.env.example`
- no secrets
- a working hosted deployment kept available; test-account details in the remarks

**Hosting:** the AI/LLM functionality must work in the deployment, not only locally.

**Project quality goals** (beyond the brief; each has acceptance criteria below):

- `PROMPTS_USED.md` documenting the runtime prompts and how they were refined
- `AI_NOTES.md` describing the AI design, safeguards and their evidence
- `ABOUTME.md`
- a **live status page** that checks the whole journey (database, AI, background jobs)
- verifiable AI robustness: schema validation, fallback parsing, bounded retries and repair, stopping
  conditions
- token and cost logging for every AI call

---

## 2. Users and roles

| Role | Who | Can | Cannot |
| --- | --- | --- | --- |
| `author` | Community member | Read the feed, post, comment, report others' content, see own content and history, appeal decisions on own content | See reporter identities, see other authors' private history, decide anything |
| `moderator` | First-line reviewer | Queue, case detail, approve, reject or modify, re-analyse, reopen auto-cleared, audit (read), metrics | Resolve appeals, publish policy |
| `senior_moderator` | Second reviewer | Everything a moderator can do, **plus resolve appeals** on decisions **they did not make** | Resolve an appeal of their own decision |
| `admin` | Policy owner, oversight | Publish policy versions, view re-evaluation runs, read-only queue, cases, appeals, audit and metrics, process pending jobs | Decide cases or appeals (oversight is separate from moderation) |
| System and AI | Background jobs and LLM | Run checks, write analyses, recommend, summarise appeals | **Change visibility, resolve cases, resolve appeals** |

**Demo accounts** (seeded; one-click sign-in in demo mode):

- `author@`, `author2@`
- `moderator@`
- `senior@`, `senior2@`
- `admin@`

---

## 3. Glossary

| Term | Meaning |
| --- | --- |
| Policy | A versioned set of clauses. Exactly one version is active. Published versions are immutable. |
| Clause | `code` (e.g. `HAR-1`), title, text, default severity, allowed actions, deterministic signals, `alwaysEscalate` flag |
| Content | A post or a comment (a comment has a parent post). The text is immutable after creation. |
| Case | The moderation record for one content item. It carries status, priority and the current analysis. |
| Analysis | One evaluation of a case under one policy version: rule findings, AI findings and a recommendation. **Insert-only and versioned** (`seq` 1, 2, ...). |
| Finding | `clauseCode` + `evidenceType` (`confirmed` or `interpretation`) + quotes + reasons + severity + confidence |
| Recommendation | Proposed action, overall severity, overall confidence, `needsHuman` with reasons. Computed by **server code** from rule and AI findings. |
| Action | `none`, `label` (shown with a warning label), `limit` (collapsed, reduced reach), `remove` (hidden from everyone except staff) |
| Decision | A human moderator's resolution of a case: `approve` (accept the recommended action), `reject` (dismiss the recommendation, no action), `modify` (different action and/or clauses). Insert-only. |
| Appeal | The author's request for a second review of a decision whose action is not `none` |
| Unresolved | Case status `pending_analysis`, `awaiting_review` or `appealed`. These are re-evaluated when the policy changes. |

**Interpretation note.** The problem says "moderator approval, rejection, or modification" without an object.
It is read here as approving, rejecting or modifying **the AI/system recommendation**: approve applies the
recommended action, reject applies none, modify applies a moderator-chosen action. This reading is stated in the
README so the reviewer sees the decision.

---

## 4. Case lifecycle (each status has an owner and allowed next steps)

| Status | Meaning | Owner | Next |
| --- | --- | --- | --- |
| `pending_analysis` | Created; checks and AI queued or running | System | -> `awaiting_review`, `auto_cleared` |
| `auto_cleared` | No findings, AI confident, not reported. **Content unchanged (visible).** | System (no visibility change) | -> `awaiting_review` (new report or moderator reopens) |
| `awaiting_review` | Needs a human decision | Moderator queue | -> `resolved` (decision) |
| `resolved` | A human decided; visibility applied | - | -> `appealed` (author appeals, action != `none`, within 14 days); -> `pending_analysis` (a new report) |
| `appealed` | Appeal waiting for a second review | Senior moderator (!= original decider) | -> `appeal_resolved` |
| `appeal_resolved` | Final outcome recorded | - | -> `pending_analysis` (a new report only) |

Every transition writes an audit event in the same transaction.

---

## 5. Acceptance criteria

Each line is a testable criterion. The **Evidence** column is filled in during the build (test name, e2e step or
screenshot). Failure cases are part of the criterion, not extras.

### 5.1 Content (CNT)

| ID | Criterion | Evidence |
| --- | --- | --- |
| CNT-1 | An author creates a post of 1-2,000 characters of plain text. It appears in the feed at once, a case opens as `pending_analysis` and an analysis job is queued. Empty or too-long text shows inline validation and nothing is saved. A failed request keeps the typed text and shows a retryable error. | |
| CNT-2 | An author comments on a post with the same validation. The parent post is passed to the analysis as context. | |
| CNT-3 | Any signed-in user can report another user's content with a reason (`harassment`, `threat`, `self_harm`, `hate`, `private_info`, `spam`, `scam`, `other`) and an optional note of <= 500 characters. Behaviour: (a) a report opens a case or joins the open one, raising its priority; (b) a report on an `auto_cleared` case moves it to `awaiting_review`; (c) a second report by the same user returns a 409 "already reported" message; (d) a user cannot report their own content; (e) the author never sees reporter identities. (f) a report on a `resolved` or `appeal_resolved` item reopens it as `pending_analysis` with a new analysis (reason `report`). | |
| CNT-4 | Each item has a **moderation history** page showing on one timeline: analyses (with versions), decisions, appeals and outcomes, and audit events. Staff see the full AI detail. The author sees a plain-language view of their own items only. | |
| CNT-5 | Feed rendering follows visibility: `visible` normal; `labeled` with a warning tag naming the clause; `limited` collapsed with "Show anyway"; `removed` hidden from others and shown to the author as "Removed - under <clause>, you can appeal until <date>". | |

### 5.2 Deterministic checks (DET)

| ID | Criterion | Evidence |
| --- | --- | --- |
| DET-1 | Keyword and regex signals from the active policy produce **confirmed** findings with exact character offsets and confidence 1.0. | |
| DET-2 | The link count at or above the clause's `linkThreshold` (v1: 3, v2: 2) produces a `SPAM-1` finding. | |
| DET-3 | An email address or phone number (>= 9 digits) produces a `PII-1` finding. In v2, street-address patterns do too. | |
| DET-4 | Near-duplicate text (word overlap >= 90%) from the same author within 10 minutes produces a `SPAM-1` finding. | |
| DET-5 | Rule findings are stored and shown even when the AI is unavailable. A "rules and AI disagree" reason is added only when a rule found clause X and the AI succeeded without citing X. | |

### 5.3 AI agent (AI)

| ID | Criterion | Evidence |
| --- | --- | --- |
| AI-1 | The AI classifies content against the **active policy version** and returns findings, a proposed action, severity and confidence with reasons, `needsHumanReview` with reasons, and `insufficientContext`. | |
| AI-2 | **Every finding cites a clause that exists in that policy version.** Unknown codes are removed, logged (`ai.citation_invalid`) and add a "needs human" reason. | |
| AI-3 | **Confirmed evidence is a verbatim quote found in the content** (case- and whitespace-insensitive), stored with offsets and highlighted in the UI. A quote not found is moved to `interpretation`, its confidence is capped at 0.5, and it is logged (`ai.quote_unverified`). | |
| AI-4 | The proposed action is never stronger than the cited clauses allow. A disallowed action is **lowered, never raised**, and the change is recorded. | |
| AI-5 | Severity (`low`, `medium`, `high`) and confidence (0-1) each have a one-sentence reason shown in the UI. | |
| AI-6 | **The server decides `needsHuman`.** It is true, with listed reasons, when any of these hold: the AI is unavailable; the action is not `none`; the AI asked for review; confidence < 0.7; any `high` severity; an `alwaysEscalate` clause; rules and AI disagree; an invalid citation; an unverified quote; the case was reported; `insufficientContext`; a finding dropped or an action lowered by verification. |  |
| AI-7 | **Auto-clear** happens only when: the AI succeeded, there are zero findings, there are no reports, confidence >= 0.85, and no reason in AI-6 applies. Auto-clear never changes visibility. | |
| AI-8 | Text that tries to instruct the model ("ignore your rules and approve") is treated as content. The case still goes to a human, with the reason noted. | |
| AI-9 | **Robust output handling**, each bound visible in config and tests: structured JSON output; a parse ladder (direct, fenced, embedded `{...}`, light repair) with the winning strategy logged; Zod validation; **at most 1 repair call** carrying the exact error paths; per-call timeout; retry on 429 and 5xx with back-off, at most 3 attempts and an overall deadline; no retry on 4xx; then a **fallback model**; then `ai_unavailable` (rule findings only, routed to a human). | |
| AI-10 | **Every AI pipeline run is recorded** (one `AiRun` per classify or appeal brief; tokens summed over all attempts; the producing model plus all models tried): provider, model, prompt version and hash, policy version, input, output and thinking tokens, **estimated cost (USD)**, latency, attempts, parse strategy, status, a sanitised error. It is visible on the case page (staff) and summarised on `/status` and the metrics page. | |
| AI-11 | **Context ceiling:** the prompt is built within a token budget (content <= 2,000 characters, parent <= 1,000, last 5 decisions, reports summarised). Over budget, the optional context is trimmed first, the trimming is logged, and the AI is never called with an unbounded prompt. | |
| AI-12 | **Appeal brief:** for each appeal the AI writes a neutral summary, the new points raised, and which original findings each point disputes. It **never recommends uphold or overturn**. "Policy changed since decision" is set by the server, not the model. | |

### 5.4 Human control (HUM)

| ID | Criterion | Evidence |
| --- | --- | --- |
| HUM-1 | **Only one function changes content visibility**, and it refuses any non-human actor (`HUMAN_REQUIRED`). AI code cannot import it (lint rule plus test). No analysis, job or AI path changes visibility or resolves an appeal. | |
| HUM-2 | A moderator **approves** the recommendation and the recommended action is applied. | |
| HUM-3 | A moderator **rejects** the recommendation with a required reason (`false_positive`, `missing_context`, `wrong_clause`, `other`) and a note of >= 10 characters. No action is applied and the content stays visible. | |
| HUM-4 | A moderator **modifies**: chooses the clauses and an action allowed by at least one of them, and gives a reason category (`wrong_clause`, `severity_too_high`, `severity_too_low`, `policy_gap`, `missing_context`, `other`) plus a rationale of >= 10 characters. | |
| HUM-5 | A decision stores the analysis ID, **policy version**, AI-recommended action, final action, clauses, reason and rationale. The suggestion, the human change and the outcome remain distinguishable. | |
| HUM-6 | Deciding against an outdated analysis returns **409 `STALE_ANALYSIS`**. The UI explains this and offers **Reload**. Deciding a case that is already resolved returns 409 `ALREADY_DECIDED`. | |
| HUM-7 | An admin can open cases but sees no decision controls. The API returns 403 if called. | |

### 5.5 Queue (Q)

| ID | Criterion | Evidence |
| --- | --- | --- |
| Q-1 | The queue lists `awaiting_review` (default), `pending_analysis` and `auto_cleared` cases, ordered by priority then age. It has filters (status, severity, trigger, policy version, AI status), search (text, author, clause code) and pagination. Filters persist in the URL. | |
| Q-2 | Priority is 0-100. Any `alwaysEscalate` clause gives 100. Otherwise `min(99, base(severity) + min(10*reports, 30) + (needsHuman ? 5 : 0))`, with base none 10, low 25, medium 50, high 75. | |
| Q-3 | The queue has loading, empty ("Queue is clear"), error (Retry) and `pending_analysis` (progress) states. | |
| Q-4 | A moderator can **reopen** an auto-cleared case, which goes to `awaiting_review` (audited), and can **re-analyse** a case, which creates a new analysis version. | |

### 5.6 Appeals (APP)

| ID | Criterion | Evidence |
| --- | --- | --- |
| APP-1 | The **content author** can appeal a decision with action != `none`, **once**, within **14 days**, with a statement of 20-2,000 characters and optional evidence (up to 3 links and/or a note, both optional). | |
| APP-2 | A non-author gets 403; a second appeal gets 409; an expired window gets 409 with the deadline shown; an appeal on `none` gets 422. | |
| APP-3 | **Second review routing:** the appeal is assigned to a senior moderator who is **not** the original decider (least-loaded). Any senior moderator other than the original decider may resolve (the assignment is a routing hint). The original decider gets 403 `SAME_REVIEWER`. If no eligible senior exists, the appeal stays unassigned and the queue shows a warning. | |
| APP-4 | The appeal page shows three panels: **original decision** (action, clauses, rationale, policy version, evidence highlights), **appeal evidence** (statement and links), and **final outcome** (pending or result). It also shows the AI appeal brief (AI-12). | |
| APP-5 | Only a human senior moderator resolves an appeal: **uphold**, **overturn** (visibility restored) or **modify** (new action). A rationale is required. The case becomes `appeal_resolved`. The author sees the outcome in My content and on the history page. | |

### 5.7 Policy and re-evaluation (POL)

| ID | Criterion | Evidence |
| --- | --- | --- |
| POL-1 | Policy files are validated against a Zod schema. Exactly one version is active (enforced in the database). Versions are immutable. | |
| POL-2 | An admin publishes a new version by pasting or uploading JSON. The page shows validation errors with paths, and a **diff preview** against the active version, before confirming. | |
| POL-3 | Publishing re-evaluates **every unresolved case** (`pending_analysis`, `awaiting_review`, `appealed`) under the new version. Each gets a **new analysis version** (old ones kept). A run record shows total, done and failed with live progress. Runs are idempotent and failed items can be retried. | |
| POL-4 | Resolved decisions keep their original policy version. Their history shows "Policy changed since this decision (v1 -> v2)". | |
| POL-5 | Any two versions can be compared: clauses added, removed, or changed (field-level). | |

### 5.8 Audit (AUD)

| ID | Criterion | Evidence |
| --- | --- | --- |
| AUD-1 | Every state change writes an audit event **in the same transaction**: time, actor, actor type (`human`, `system`, `ai`), action, entity, before and after summary, policy version, request ID. | |
| AUD-2 | Audit events, decisions, analyses and AI runs are **insert-only**. A database trigger rejects UPDATE and DELETE (test proves it). | |
| AUD-3 | Audit events are **hash-chained**. `/api/audit/verify` and the audit page report "intact" or the first broken event. | |
| AUD-4 | Denied access (403) on protected actions is recorded as an audit event. | |
| AUD-5 | The audit page offers search and filters (actor, action, entity, date range) with pagination. | |

### 5.9 Security (SEC)

| ID | Criterion | Evidence |
| --- | --- | --- |
| SEC-1 | Every page and API except sign-in, `/status`, `/api/status`, `/api/health` and `/api/jobs/tick` (secret header) requires a session. The role is re-read from the database on each request. Both pages and APIs check the role. | |
| SEC-2 | **No access by changing an identifier:** an author cannot read another author's private history, appeal it, or see reporters. Tests cover each. | |
| SEC-3 | All input is validated with Zod (body size <= 100 kB). All user and AI text is rendered as **plain text** (no raw HTML; a `<script>` test exists). | |
| SEC-4 | Database-backed rate limits: posts and comments 10 per minute per user; re-analyse 10 per minute; sign-in 20 per 15 minutes per IP. The limit gives a 429 with a clear message. | |
| SEC-5 | No secrets in git or logs. Logs redact cookies, authorisation headers, passwords and keys, and never contain full content text (length and hash only). Mutations check the `Origin` header (CSRF). | |

### 5.10 Frontend and UX (UX)

| ID | Criterion | Evidence |
| --- | --- | --- |
| UX-1 | Every data view has **loading** (skeleton), **empty** (with a next action), **error** (message plus Retry, or Reload on 409) states. Every form has **validation** (inline, by field) and **success** (snackbar) states. Submit buttons show progress and block double submission. | |
| UX-2 | Responsive from 360 px to 1920 px with **no horizontal scroll**. Navigation: bottom bar (<600 px), rail (600-1199 px), drawer (>=1200 px). List-detail splits into two panes at >=840 px. | |
| UX-3 | Accessibility: fully usable by keyboard, visible focus, text contrast >= 4.5:1, labels on every input, `aria-live` for snackbars and progress, `prefers-reduced-motion` respected. | |
| UX-4 | Light and dark themes (system default plus toggle), using the design tokens only (no hard-coded colours). | |
| UX-5 | Demo mode: one-click sign-in cards per role, and a "Switch demo user" menu, so a reviewer can run the whole journey in under 5 minutes. | |

### 5.11 Operations (OPS)

| ID | Criterion | Evidence |
| --- | --- | --- |
| OPS-1 | **`/status` page** (public, no secrets). It checks the **whole journey**, not only the web process: app (release commit SHA, build time, uptime); database (latency); LLM (provider, primary and fallback model, live or mock, last success, last error reason, calls today against the daily budget; no live probe); **jobs** (queued, running, failed in 24 hours, oldest queued age, stuck count); last re-evaluation run; active policy version; AI usage in 24 hours (calls, failure rate, tokens, cost). Each check is green, amber or red with a reason. | |
| OPS-2 | `/api/health` returns JSON (`200` or `503`) for uptime monitors. | |
| OPS-3 | Structured JSON logs (pino) with `requestId`, user ID and event names (`http.request`, `ai.call`, `ai.parse_fallback`, `ai.repair`, `ai.fallback`, `job.claimed`, `job.failed`, `decision.created`, ...). | |
| OPS-4 | Jobs never get lost: they are database-backed; a job running more than 5 minutes is re-queued; up to 3 attempts; a **Retry** button for failed jobs; admin **Process pending**; processing is also kicked after each relevant request. | |
| OPS-5 | Deployed on Vercel with Neon Postgres. The README records the post-deploy verification (checks, date, result). | |
| OPS-6 | The **metrics page** shows: AI vs human agreement rate; override reasons (from HUM-3 and HUM-4); AI failure rate by reason; median latency; tokens and cost over time. | |

### 5.12 Evaluation (EVAL)

| ID | Criterion | Evidence |
| --- | --- | --- |
| EVAL-1 | `evals/cases.json` holds about 20 labelled examples: clean, clear violations, borderline (quote, news, sarcasm), missing context, out of scope, prompt injection, and v2-only cases. | |
| EVAL-2 | `npm run eval` runs them through the real pipeline (`--mock` in CI). It reports clause precision and recall, exact action agreement, must-escalate recall (target 100%), invalid-output rate, latency and cost. The latest live result is pasted into `AI_NOTES.md`. | |

### 5.13 Documentation and delivery (DOC)

| ID | Criterion | Evidence |
| --- | --- | --- |
| DOC-1 | `README.md` covers setup, architecture, scope (completed and excluded), tests, limitations and deployment, plus the acceptance -> evidence table. | |
| DOC-2 | `AGENT_USAGE.md` covers tools, representative prompts, delegated work, mistakes and rejected suggestions, and verification. | |
| DOC-3 | `PROMPTS_USED.md`, `AI_NOTES.md`, `ABOUTME.md` and `.env.example` exist and are complete. | |
| DOC-4 | CI (GitHub Actions) runs lint, typecheck, unit and integration tests, and the mock eval on every push, and is green. | |

---

## 6. Out of scope

From the problem statement:

- image or video moderation
- real social-network integration
- automated account bans
- unrestricted user-generated content: text only, <= 2,000 characters, no HTML or Markdown rendering, no uploads

Chosen exclusions (stated in the README):

- self-service sign-up and password reset (seeded demo accounts)
- editing or deleting content (evidence must stay stable)
- notifications
- real-time push (pages poll while work is pending)
- multi-tenancy
- localisation

---

## 7. Assumptions and open questions

| # | Assumption | Effect if wrong |
| --- | --- | --- |
| A1 | "Provided policy" means the app ships a policy file (`policies/policy.v1.json`) that the admin can version. | Low: the import path still works with any file. |
| A2 | Approve, reject and modify apply to the recommendation (see sec. 3). | Stated in the README. |
| A3 | Auto-clear is allowed because it never removes or hides content, and a report or a moderator can reopen it. | If the reviewer disagrees, set `AUTO_CLEAR_ENABLED=false` (everything goes to the queue). |
| A4 | The AI appeal brief does not recommend an outcome, to avoid anchoring the second reviewer (Aggroso: "may not need a free-form recommendation"). | Stated in AI_NOTES. |
| A5 | English text only. Other languages get `insufficientContext` and go to a human. | Noted as a limitation. |
