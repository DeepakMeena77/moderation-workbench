# Release notes

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

All migrations only add tables, columns, constraints and triggers. None drops or rewrites user data, except the
one-time hash backfill of existing audit events.

### Post-deploy checks

<!-- Filled in from the production checks after the final deploy. -->

| Check | How | Result |
| --- | --- | --- |
| Status page all green | `/status` | |
| Audit chain intact | Audit page banner (`/api/audit/verify`) | |
| Live journey | Post, review, decide, appeal, second review | |
| Live AI run recorded with tokens and cost | Case page, AI run panel | |
| CI green on the release commit | GitHub Actions | |

### Rollback

Vercel keeps every deployment, and promoting an earlier one restores that app version. The migrations are additive,
with one exception: after `20261108110000_s7_audit_chain`, every audit event needs a hash, and app versions from
before that migration do not write one, so they would fail on any audited change. Fixes after this release are
therefore rolled forward, not back past S7.

### Known issues

See "Known limitations" in the [README](../README.md#known-limitations).
