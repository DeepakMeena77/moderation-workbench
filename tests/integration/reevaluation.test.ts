import { readFileSync } from 'node:fs';
import type { CaseStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getRunRoute } from '@/app/api/reevaluations/[id]/route';
import { POST as retryRoute } from '@/app/api/reevaluations/[id]/retry/route';
import { AppError } from '@/server/errors';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { createPost } from '@/server/services/content';
import { publishPolicy } from '@/server/services/policy';
import { getRun, retryFailed } from '@/server/services/reevaluation';
import { createReport } from '@/server/services/reports';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// Re-evaluation after a policy publish (POL-3, docs/02-system-design.md sec. 6): one transaction retires v1,
// inserts v2, creates the run and enqueues one analyse job per unresolved case; each job adds to done or failed.

const V2_TEXT = readFileSync('policies/policy.v2.json', 'utf8');
const failing = { analyze: async () => Promise.reject(new Error('database hiccup')) };

async function post(body: string) {
  const author = await createUser('author');
  return createPost(actorFor(author), { body }, 'req-reeval-0001');
}

async function setStatus(caseId: string, status: CaseStatus) {
  await getDb().case.update({ where: { id: caseId }, data: { status } });
}

async function publishV2() {
  const admin = await createUser('admin');
  return { admin, result: await publishPolicy(actorFor(admin), { json: V2_TEXT }, 'req-publish-0001') };
}

beforeEach(async () => {
  await installPolicy(1);
});

describe('re-evaluation run', () => {
  it('[POL-3] only unresolved cases are re-analysed; resolved and auto-cleared cases keep their analysis', async () => {
    const awaiting = await post('You are a worthless idiot');
    const appealed = await post('You are an idiot, honestly');
    const resolved = await post('What a worthless take');
    const cleared = await post('See you all at the lake on Sunday');
    expect(await runPendingJobs()).toMatchObject({ succeeded: 4 });
    // The statuses are set here, not left to the AI result: this test is about which statuses are re-analysed.
    // Every fixture has an analysis seq 1 first, so a skipped case visibly keeps exactly one.
    await setStatus(appealed.caseId, 'appealed');
    await setStatus(resolved.caseId, 'resolved');
    await setStatus(cleared.caseId, 'auto_cleared');

    const { result } = await publishV2();
    expect(result.version).toBe(2);
    expect(result.run).toMatchObject({ fromVersion: 1, toVersion: 2, total: 2, done: 0, failed: 0, state: 'running' });

    const db = getDb();
    const jobs = await db.job.findMany({ where: { runId: result.run.id } });
    expect(jobs.map((job) => (job.payload as { caseId: string }).caseId).sort()).toEqual(
      [awaiting.caseId, appealed.caseId].sort(),
    );
    expect(jobs.every((job) => (job.payload as { reason: string }).reason === 'policy_change')).toBe(true);

    expect(await runPendingJobs()).toMatchObject({ claimed: 2, succeeded: 2 });
    const run = await getRun(result.run.id);
    expect(run).toMatchObject({ done: 2, failed: 0, state: 'finished' });
    expect(run.finishedAt).not.toBeNull();

    for (const caseId of [resolved.caseId, cleared.caseId]) {
      const analyses = await db.analysis.findMany({ where: { caseId } });
      expect(analyses.map((a) => [a.seq, a.policyVersion])).toEqual([[1, 1]]);
    }
    // An appealed case stays appealed; the new analysis is for the appeal reviewer (02 sec. 6).
    expect((await db.case.findUniqueOrThrow({ where: { id: appealed.caseId } })).status).toBe('appealed');
  });

  it('[POL-3] each re-analysed case gets a new analysis seq under v2, the old one is kept and is no longer current', async () => {
    const created = await post('You are a worthless idiot');
    await runPendingJobs();
    const db = getDb();
    const before = await db.analysis.findFirstOrThrow({ where: { caseId: created.caseId } });

    await publishV2();
    await runPendingJobs();

    const analyses = await db.analysis.findMany({ where: { caseId: created.caseId }, orderBy: { seq: 'asc' } });
    expect(analyses.map((a) => [a.seq, a.policyVersion, a.reason])).toEqual([
      [1, 1, 'initial'],
      [2, 2, 'policy_change'],
    ]);
    expect(analyses[0]).toEqual(before);
    // decide() (S4) answers 409 STALE_ANALYSIS for any analysisId other than currentAnalysisId (HUM-6). A moderator
    // still looking at the v1 analysis is therefore refused once this has moved to the v2 one.
    const kase = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(kase.currentAnalysisId).toBe(analyses[1]?.id);
    expect(kase.currentAnalysisId).not.toBe(before.id);
  });

  it('[POL-3] the v2 SPAM-1 link threshold changes the outcome of a two-link post', async () => {
    // [mock:invalid] makes the AI fail on purpose, so both analyses are rule-only and the outcome depends on the
    // policy's linkThreshold alone (3 in v1, 2 in v2), not on what the mock happens to flag.
    const created = await post('Great deals at https://shop.example/a and https://shop.example/b [mock:invalid]');
    const reporter = await createUser('author');
    await createReport(actorFor(reporter), created.id, { reason: 'spam' }, 'req-reeval-report');
    await runPendingJobs();
    const db = getDb();
    const v1 = await db.analysis.findFirstOrThrow({ where: { caseId: created.caseId }, orderBy: { seq: 'desc' } });
    expect(v1).toMatchObject({ policyVersion: 1, aiStatus: 'invalid_output' });
    expect(v1.ruleFindings).toEqual([]);
    expect(v1.recommendation).toMatchObject({ action: 'none', clauseCodes: [] });
    expect((await db.case.findUniqueOrThrow({ where: { id: created.caseId } })).status).toBe('awaiting_review');

    await publishV2();
    await runPendingJobs();

    const v2 = await db.analysis.findFirstOrThrow({ where: { caseId: created.caseId }, orderBy: { seq: 'desc' } });
    expect(v2).toMatchObject({ policyVersion: 2, reason: 'policy_change', aiStatus: 'invalid_output' });
    expect(v2.recommendation).toMatchObject({ action: 'label', clauseCodes: ['SPAM-1'], needsHuman: true });
    expect(v2.ruleFindings).toEqual([expect.objectContaining({ clauseCode: 'SPAM-1' })]);
  });

  it('[POL-3] publishing is idempotent: the same clauses again answer 409 POLICY_UNCHANGED and start no run', async () => {
    await post('You are a worthless idiot');
    const { admin } = await publishV2();
    const again = await publishPolicy(actorFor(admin), { json: V2_TEXT }, 'req-publish-0002').catch((e: unknown) => e);
    expect(again).toBeInstanceOf(AppError);
    expect(again).toMatchObject({ code: 'POLICY_UNCHANGED', status: 409, details: { sameAsVersion: 2 } });

    // Re-publishing v1's clauses is also unchanged content (contentHash is unique), whatever "version" says.
    const v1Text = readFileSync('policies/policy.v1.json', 'utf8');
    await expect(publishPolicy(actorFor(admin), { json: v1Text }, 'req-publish-0003')).rejects.toMatchObject({
      code: 'POLICY_UNCHANGED',
      details: { sameAsVersion: 1 },
    });

    const db = getDb();
    expect(await db.policy.count()).toBe(2);
    expect(await db.reevaluationRun.count()).toBe(1);
    expect(await db.job.count({ where: { runId: { not: null } } })).toBe(1);
    expect(await db.auditEvent.count({ where: { action: 'policy.published' } })).toBe(1);
  });

  it('[POL-3] a failed item is counted and can be retried; the retried job finishes the run', async () => {
    const created = await post('You are a worthless idiot');
    await runPendingJobs();
    const { admin, result } = await publishV2();
    const db = getDb();
    // One attempt, so the failure is final at once instead of after the 30 s and 2 min back-offs.
    await db.job.updateMany({ where: { runId: result.run.id }, data: { maxAttempts: 1 } });

    expect(await runPendingJobs({ handlers: failing })).toMatchObject({ failed: 1 });
    expect(await getRun(result.run.id)).toMatchObject({ done: 0, failed: 1, state: 'finished_with_failures' });

    const retried = await retryFailed(actorFor(admin), result.run.id, 'req-retry-0001');
    expect(retried).toMatchObject({ retried: 1, run: { failed: 0, state: 'running', finishedAt: null } });
    const job = await db.job.findFirstOrThrow({ where: { runId: result.run.id } });
    expect(job).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await db.auditEvent.count({ where: { action: 'reevaluation.retried', entityId: result.run.id } })).toBe(1);

    expect(await runPendingJobs()).toMatchObject({ succeeded: 1 });
    expect(await getRun(result.run.id)).toMatchObject({ done: 1, failed: 0, state: 'finished' });
    const latest = await db.analysis.findFirstOrThrow({ where: { caseId: created.caseId }, orderBy: { seq: 'desc' } });
    expect(latest).toMatchObject({ seq: 2, policyVersion: 2 });

    // Nothing left to retry: a no-op, not an error.
    expect(await retryFailed(actorFor(admin), result.run.id, 'req-retry-0002')).toMatchObject({ retried: 0 });
  });

  it('[POL-3] publishing with no unresolved cases records a finished run of 0 items', async () => {
    const { result } = await publishV2();
    expect(result.run).toMatchObject({ total: 0, done: 0, failed: 0, state: 'finished' });
    expect(await getDb().job.count()).toBe(0);
  });

  it('[POL-3] the policy, the run, the jobs and both audit events are written together', async () => {
    await post('You are a worthless idiot');
    await runPendingJobs();
    const { admin, result } = await publishV2();
    const db = getDb();
    expect(await db.policy.findMany({ orderBy: { version: 'asc' }, select: { version: true, status: true } })).toEqual([
      { version: 1, status: 'retired' },
      { version: 2, status: 'active' },
    ]);
    const events = await db.auditEvent.findMany({
      where: { action: { in: ['policy.published', 'reevaluation.started'] } },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => [e.action, e.actorId, e.policyVersion, e.requestId])).toEqual([
      ['policy.published', admin.id, 2, 'req-publish-0001'],
      ['reevaluation.started', admin.id, 2, 'req-publish-0001'],
    ]);
    expect(events[0]?.after).toMatchObject({ added: ['SCAM-1'], changed: ['PII-1', 'SPAM-1'], removed: [] });
    expect(events[1]).toMatchObject({ entityType: 'reevaluation', entityId: result.run.id });
  });
});

describe('re-evaluation routes', () => {
  it('[POL-3] staff read live progress; an author gets 403; an unknown run is 404', async () => {
    await post('You are a worthless idiot');
    const { result } = await publishV2();
    const moderator = await createUser('moderator');
    const res = await getRunRoute(
      apiRequest(`/api/reevaluations/${result.run.id}`, { cookie: await sessionCookieFor(moderator.id) }),
    );
    expect(res.status).toBe(200);
    expect((await readJson<{ data: unknown }>(res)).data).toMatchObject({ total: 1, done: 0, state: 'running' });

    const author = await createUser('author');
    const forbidden = await getRunRoute(
      apiRequest(`/api/reevaluations/${result.run.id}`, { cookie: await sessionCookieFor(author.id) }),
    );
    expect(forbidden.status).toBe(403);

    const missing = await getRunRoute(
      apiRequest('/api/reevaluations/no-such-run', { cookie: await sessionCookieFor(moderator.id) }),
    );
    expect(missing.status).toBe(404);
  });

  it('[POL-3] Retry failed through the API: staff only, and an author gets 403', async () => {
    const { result } = await publishV2();
    const admin = await createUser('admin');
    const ok = await retryRoute(
      apiRequest(`/api/reevaluations/${result.run.id}/retry`, {
        method: 'POST',
        cookie: await sessionCookieFor(admin.id),
      }),
    );
    expect(ok.status).toBe(200);
    expect((await readJson<{ data: unknown }>(ok)).data).toMatchObject({ retried: 0 });

    const author = await createUser('author');
    const forbidden = await retryRoute(
      apiRequest(`/api/reevaluations/${result.run.id}/retry`, {
        method: 'POST',
        cookie: await sessionCookieFor(author.id),
      }),
    );
    expect(forbidden.status).toBe(403);
  });
});
