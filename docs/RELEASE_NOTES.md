# Release notes

## 1.0.2 (2026-11-08)

- The visibility trigger also checks the actor: a change needs `app.actor_id` naming a user whose stored role is
  moderator or senior moderator (migration `20261108130000_visibility_actor_role`, replaces one function only).
- An integration test pauses the model call and shows no database transaction is open while it runs.
- Verify lowers a proposed action to the strongest allowed action at or below it, never raising it.
- Recommending language in the appeal brief's summary is flagged, logged and shown as a warning to the reviewer.
- Fallback-model runs are costed at their own prices when `AI_PRICE_FALLBACK_*` is set.
- Attribute values in the appeal brief prompt are escaped.
- Metrics show how many auto-cleared cases were later reported or reopened.
- The evaluation reports exact action agreement; E12 is stricter; three live runs are kept (19/21 each).

Post-deploy checks for `240523c`, 2026-11-07 23:24 UTC (8 Nov in India):

| Check | Result |
| --- | --- |
| Release live | `/api/health` reports `240523c...`, database connected |
| Status page | All six checks operational |
| Trigger with the role check, on a real decision | A moderator modified Gemini's "label" to "limit" on a new post; the post's visibility became `limited` |
| Audit chain | `intact: true`, 48 events; the latest is event 48, `decision.created` at 23:23:53 UTC |
| AI runs and the new auto-clear metric | 13 runs, 0 failures, p50 3.4 s, p90 4.8 s; 7 cases auto-cleared, 1 later revisited |
| CI on the release commit | GitHub Actions run 42424929012 succeeded |

## 1.0.1 (2026-11-08)

- A finding that verification had to drop, or a proposed action lowered to what the cited clauses allow, is now a
  "needs a human" reason, so such a case can never be auto-cleared (14 reasons in total).
- Stored AI error messages redact the newer `AQ.` Google key format as well as `AIza...` keys.
- `.env.example` carries the public model ids and prices, so a fresh clone starts in mock mode without edits to
  the AI settings; a unit test parses it.
- The evaluation reports strict clause precision (every unexpected citation counts against it) next to the
  labelled-codes precision, and the live results were re-run.

No database migration.

Post-deploy checks for `69681bd`: `/api/health` reports `69681bd...` with the database connected; `/status` shows
all six checks operational; `/api/audit/verify` reports `intact: true` over 43 events; GitHub Actions run
42416623073 succeeded (verify and browser jobs).

## 1.0.0 (2026-11-08)

Production: https://moderation-workbench.vercel.app (Vercel `sin1`, Neon Postgres in Singapore).

### Included

- Posts, comments and reports, with deterministic rule checks and a bounded Gemini review against a versioned
  policy.
- A review queue and case page where a human approves, modifies or rejects every recommendation.
- Appeals routed to a different senior moderator, with a neutral AI summary that never recommends an outcome.
- Policy versions with compare, publish and re-evaluation of unresolved cases.
- A hash-chained, insert-only audit trail with an integrity check, an audit page and a metrics page.
- A public status page.

### Database migrations (applied in order by `prisma migrate deploy` during the Vercel build)

| Migration | Change |
| --- | --- |
| `20261107160000_s1_users_rate_limits` | Users, sessions, rate limits |
| `20261107180000_s2_content_policy_jobs` | Content, reports, cases, policy versions, job queue |
| `20261107200000_s3_ai_runs_insert_only` | AI runs and analyses, insert-only |
| `20261107200000_s4_decisions_visibility` | Decisions; visibility changes only by a human, enforced by a trigger |
| `20261107210000_unify_forbid_mutation` | One shared insert-only trigger function |
| `20261108093000_s6_reevaluation_runs` | Re-evaluation runs for policy publishes |
| `20261108110000_s7_audit_chain` | Audit hash chain; existing events chained in SQL; audit made insert-only |
| `20261108120000_s5_appeals` | Appeals; a resolved appeal is final |

Migration folders sort by name. S3 and S4 share a timestamp and sort by their suffix; S5 was renamed at review to
sort after S6 and S7, because production had already applied S6 when S5 was merged.

All migrations only add tables, columns, constraints and triggers. None drops or rewrites user data, except the
one-time hash backfill of existing audit events.

### Post-deploy checks

Run on 2026-11-08 against release `d970152`. Later commits on `main` change documentation, screenshots and the
fixes listed under 1.0.1; each was verified by CI before deploy.

| Check | How | Result |
| --- | --- | --- |
| Release live | `/api/health` | `version` is `d970152...`, database connected |
| Status page all green | `/status` | All six checks operational: app, database, AI model (`gemini-3.5-flash-lite`, fallback `gemini-3.6-flash`), jobs, policy v1, AI usage |
| Migrations applied | Vercel build log, `/api/audit/verify` | S7 chained the 5 existing audit events in SQL; S5 created the appeals table |
| Audit chain intact | `/api/audit/verify` as admin | `intact: true`, 43 events checked |
| Live journey | Demo users through the API and pages | 8 posts analysed by Gemini, 2 reports, a moderator decision (approve, HAR-1), an appeal with a neutral AI brief (no outcome field), and a scam post waiting for review |
| Live AI runs recorded with tokens and cost | `/api/metrics`, `/status` | 12 runs, 0 failures, p50 3.4 s, p90 4.9 s, 21,926 tokens, 0.0098 USD |
| CI green on the release commit | GitHub Actions run 42413737509 | verify and browser jobs succeeded |

### Rollback

Vercel keeps every deployment, and promoting an earlier one restores that app version. The migrations are additive,
with one exception: after `20261108110000_s7_audit_chain`, every audit event needs a hash, and app versions from
before that migration do not write one, so they would fail on any audited change. Fixes after this release are
therefore rolled forward, not back past S7.

### Known issues

See "Known limitations" in the [README](../README.md#known-limitations).
