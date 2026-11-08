# AI notes

How the AI works in this product, what it is allowed to do, how its output is checked, and what it costs.
Runtime prompts and their refinements are in [PROMPTS_USED.md](PROMPTS_USED.md). How coding agents were used to
build the app is in [AGENT_USAGE.md](AGENT_USAGE.md).

## 1. Responsibility boundary

| The AI does | The AI never does |
| --- | --- |
| Classify text against the active policy version | Change content visibility |
| Cite clause codes and quote evidence | Resolve a case or an appeal |
| Separate confirmed evidence from interpretation | Decide whether a human is needed (the server decides) |
| Propose an action, severity and confidence with reasons | Write anything except its own `AiRun` record |
| Summarise an appeal neutrally for the second reviewer | Recommend upholding or overturning an appeal |

Release boundary: the AI drafts recommendations for human review. It is not suitable for unattended action, and
the code makes unattended action impossible (see section 4).

## 2. Provider and models

| Setting | Value | Why |
| --- | --- | --- |
| Provider | Google Gemini (`@google/genai`), behind a provider interface | Free tier for the demo; swappable |
| Primary model | `gemini-3.5-flash-lite` | Fast and cheap; valid structured output in a live check |
| Fallback model | `gemini-3.6-flash` | Separate quota; used only for transport failures |
| Test provider | Deterministic mock with failure markers | Tests and CI never call the network |
| Output mode | JSON with a response schema, then Zod validation | Structured output, still checked by code |
| Thinking | Minimal thinking level | Lower latency and cost; confirmed accepted live (0 thinking tokens) |

Model probe on the project key before choosing (one tiny JSON request each):

| Model | Result |
| --- | --- |
| gemini-3.5-flash-lite | 200, valid JSON, about 2.1 s |
| gemini-2.5-flash-lite | 404, retired for new keys although still listed |
| gemini-3.1-flash-lite | 503 at test time |
| gemini-3.5-flash | 200 but output truncated to `{"` at a 20-token cap: thinking consumed the budget (deprecated; routed to 3.6-flash) |

## 3. Deterministic checks vs AI

| Layer | What it does | Code |
| --- | --- | --- |
| Rules | Keywords and patterns from the policy, link count, contact details, repeat posting. Exact offsets, confidence 1 | `src/server/rules/` |
| AI | Context, sarcasm, quoting, implied threats, missing context | `src/server/ai/` |
| Combine | Merges both, computes the recommendation and every "needs a human" reason | `src/server/moderation/combine.ts` |

## 4. Safeguards and their evidence

| Safeguard | Where | Test |
| --- | --- | --- |
| Only a human moderator can change visibility; the database checks the actor's stored role | `src/server/services/visibility.ts`, DB trigger (S4, role check in `20261108130000_visibility_actor_role`) | `tests/integration/decisions.test.ts`, `tests/integration/analysis.test.ts` `[HUM-1]` |
| AI code cannot import visibility or decisions | ESLint rule | `tests/unit/boundaries.test.ts` |
| Output schema has no decide/approve/status field; unknown keys stripped | `src/server/ai/output.ts` | `tests/unit/output.test.ts` |
| Server, not model, decides `needsHuman` | `src/server/moderation/combine.ts` | `tests/unit/combine.test.ts` `[AI-6]` |
| Every clause must exist in that policy version | `src/server/ai/verify.ts` | `tests/unit/verify.test.ts` `[AI-2]` |
| Confirmed quotes must appear verbatim, else interpretation with confidence <= 0.5 | `src/server/ai/verify.ts` | `tests/unit/verify.test.ts` `[AI-3]` |
| A speculative interpretation (confidence below 0.4) carries at most low severity | `src/server/ai/verify.ts` | `tests/unit/verify.test.ts` `[AI-3]` |
| Proposed action lowered to what the clauses allow, never raised | `src/server/ai/verify.ts` | `tests/unit/combine.test.ts`, `tests/unit/classify.test.ts` `[AI-4]` |
| Prompt injection treated as content and routed to a human | `src/server/ai/prompts.ts` (`detectInjectionSignals`) | `tests/integration/analysis.test.ts` `[AI-8]` |
| Parse ladder: direct, fenced, embedded, repaired | `src/server/ai/parse.ts` | `tests/unit/parse.test.ts` `[AI-9]` |
| At most one repair call, then stop | `src/server/ai/pipeline.ts` | `tests/unit/classify.test.ts` `[AI-9]` |
| Bounded retries, timeout, overall deadline, fallback model | `src/server/ai/pipeline.ts`, `aiConfig.ts` | `tests/unit/classify.test.ts` `[AI-9]` |
| Context budget; content never trimmed | `src/server/ai/budget.ts` | `tests/unit/budget.test.ts` `[AI-11]` |
| Every pipeline run recorded with tokens and cost, success or failure | `src/server/ai/aiRun.ts`, `services/aiRuns.ts` | `tests/integration/analysis.test.ts` `[AI-10]` |
| AiRun and Analysis rows cannot be updated or deleted | DB triggers in the S3 migration | `tests/integration/audit.test.ts` `[AUD-2]` |
| Daily AI call budget protects the demo quota | `src/server/ai/pipeline.ts` | `tests/unit/classify.test.ts` |
| AI call never holds a database transaction | `src/server/jobs/handlers.ts` (prepare, call the model, record) | `tests/integration/analysis.test.ts` `[AI-9]`: the model call is paused and no session is idle in a transaction, with a control that detects one |
| A finding dropped by verification, or an action lowered to what the clauses allow, always goes to a human (never auto-cleared) | `src/server/moderation/combine.ts` | `tests/unit/combine.test.ts` `[AI-6]` `[AI-4]`, end to end in `tests/integration/safeguards.test.ts` `[AI-6]` |
| Appeal brief has no outcome field; an added one is stripped | `src/server/ai/appealBrief.ts` | `tests/unit/appealBrief.test.ts` `[AI-12]` |
| Recommending language in the brief's summary is flagged and shown as a warning | `src/server/ai/appealBrief.ts`, `src/ui/features/appeals/AppealReview.tsx` | `tests/unit/appealBrief.test.ts`, `tests/components/AppealReview.test.tsx` `[AI-12]` |
| Fallback runs are costed at the fallback model's own prices | `src/server/ai/cost.ts`, `aiConfig.ts` | `tests/unit/cost.test.ts` `[AI-10]` |
| "Policy changed since decision" comes from the database, not the model | `src/server/services/appeals.ts` | `tests/integration/appeals.test.ts` `[AI-12]` |
| Every AI write and human decision is in a hash-chained, insert-only audit trail | `src/server/services/audit.ts`, S7 migration | `tests/integration/audit.test.ts` `[AUD-3]` |

## 5. Appeal brief

When an author appeals, a job asks the model for a neutral brief for the senior moderator: a summary, up to five
new points the appeal raises, and which of the original findings each point disputes. It runs through the same
bounded pipeline as classification (budget, provider chain, parse ladder, Zod, at most one repair, verify) and
records its own `AiRun` (purpose `appeal_brief`).

- The output contract has no outcome, recommendation, decision or status field, and unknown keys are stripped, so a
  model that adds "uphold" changes nothing.
- Verify drops disputed clauses that the original decision never cited.
- If the AI fails, the appeal page says the summary is unavailable and the review goes on without it.
- Whether the policy changed since the decision is computed by the server from the stored versions.

## 6. Bounds

| Bound | Default |
| --- | --- |
| Per-call timeout | 12 s |
| Overall deadline per classification | 25 s |
| Attempts per model (429, 5xx, timeout only) | 3, back-off capped at 10 s |
| Repair calls | 1 |
| Input budget | 6,000 tokens (estimated) |
| Output cap | 2,048 tokens |
| Pacing between calls | 4 s per instance |
| Daily calls | 200 |

The prompt carries the content (up to 2,000 characters) and the active policy, which are never trimmed, plus
optional context that is trimmed first under the input budget: the parent post (up to 1,000 characters), report
reasons, the rule findings and the author's last 5 final actions.

When every bound is used up, the analysis is saved with rule findings only, marked AI unavailable with a plain
reason, and routed to a human. AI failure never blocks the workflow.

## 7. Cost and a live run

- Prices are configuration: 0.30 USD per million input tokens and 2.50 USD per million output tokens (thinking
  tokens billed as output), from Google's published pricing for the primary model.
- Live smoke run (2026-11-07), "You are a worthless idiot and everyone hates you.":
  `gemini-3.5-flash-lite`, status ok, 4.4 s, 1 call, 1,735 input / 223 output / 0 thinking tokens,
  finding HAR-1 (confirmed). Estimated cost about 0.0011 USD.

## 8. Evaluation

`npm run eval` runs 21 labelled cases ([evals/cases.json](evals/cases.json)) through the product's real decision
path: deterministic rules, the bounded AI pipeline, then the server's `combine()`. The cases cover clean posts,
clear violations, quoting, sarcasm, banter, missing context, a non-English insult, prompt injection, a
tag-escape attempt and v2-only clauses. They are kept out of the prompt examples. CI runs the same harness with
the mock provider as a pipeline check.

The current prompt is classify v2. It was measured in three live runs, 2026-11-07 23:39 to 23:42 UTC (8 Nov in
India), `gemini-3.5-flash-lite`, one report each: [run 1](evals/results/2026-11-07-2339Z-gemini-3.5-flash-lite.md),
[run 2](evals/results/2026-11-07-2340Z-gemini-3.5-flash-lite.md),
[run 3](evals/results/2026-11-07-2342Z-gemini-3.5-flash-lite.md). The three v1 runs it replaced are kept for
comparison ([22:03](evals/results/2026-11-07-2203Z-gemini-3.5-flash-lite.md),
[22:04](evals/results/2026-11-07-2204Z-gemini-3.5-flash-lite.md),
[22:06](evals/results/2026-11-07-2206Z-gemini-3.5-flash-lite.md)); see PROMPTS_USED.md sec. 3.5.

| Metric | v2 (3 runs) | v1 (3 runs) |
| --- | --- | --- |
| Cases passed | 19, 20, 20 of 21 | 19 of 21 each |
| Clause recall | 100% | 100% |
| Clause precision, labelled codes | 100% | 100% |
| Clause precision, strict (every unexpected citation counts against it) | 69%, 73%, 79% | 69% each |
| Exact action agreement (18 cases name one most likely action) | 16, 17, 17 of 18 | 15 of 18 each |
| Action within each case's acceptable set | 14, 15, 15 of 15 | 13 of 15 each |
| Must-escalate recall (target 100%) | 100% | 100% |
| False escalation on clean cases | 0 of 5 | 0 of 5 |
| AI failures / invalid output / repair | 0 / 0% / 0 | 0 / 0% / 0 |
| Fallback model used | 1, 0, 2 calls (transient errors on the primary) | 0 |
| Latency p50 / p90 | 3.9 s / 4.4-5.0 s | 4.0 s / 4.4-4.8 s |
| Cost for 21 cases | 0.022-0.023 USD per run | 0.021 USD per run |

What the runs show:

- **E09 still fails, but its outcome is now safe.** A news report quoting "I will hurt you" matches the
  deterministic THR-1 pattern, so the label "must not confirm THR-1" still fails. Under v2 the model does not
  confirm the quote, so the pattern hit no longer forces "remove": the recommendation is "none", with the reason
  "Rules matched THR-1 by keyword or pattern, but the AI, reading the context, did not confirm it", and the case
  goes to a human.
- **E12 is not deterministic.** "Exactly, they deserve it." under a post about a vandalised shop passed in two of
  three v2 runs ("none") and got THR-1 with "remove" in one. Every v1 run failed it.
- **Over-citation dropped, with one new case.** Friendly banter (E11) and the Spanish insult (E13) are no longer
  cited; E13 goes to a human as insufficient context. Sarcasm (E10) is still labelled as possible harassment. New
  under v2: in two of three runs the home-address post (E17) was also cited as HAR-1 next to PII-1, because it
  urges people to confront the woman named. Both keep strict precision below 80%.
- **Fallback in practice.** Three calls across the v2 runs fell back to `gemini-3.6-flash` after the primary
  model used up its retries, and each still returned valid output. The local evaluation used the primary prices
  for them; production costs fallback calls at the fallback model's own prices (`AI_PRICE_FALLBACK_*`).

## 9. Known limitations

- When the model treats a keyword or pattern hit as interpretation only, that hit adds no action, so a genuine
  threat the model misreads would be recommended as "none". It is never actioned that way: the case always goes
  to a human with the hit, its high severity and the reason shown. Capping such hits at the clause's mildest
  action instead would bring back "limit" for quoted news (E09); the evaluation favoured "none".
- Model prices are configuration copied from Google's published list on 2026-11-08: 0.30 / 2.50 USD per million
  tokens for the primary model and 0.75 / 3.75 for the fallback model, which rise to 1.50 / 7.50 on 2027-01-01.
- Pacing is per serverless instance, best effort.
- English only; other languages are routed to a human.
- Free-tier quotas are small; the daily budget and the fallback model reduce, but do not remove, the chance of
  "AI unavailable" during heavy review.
