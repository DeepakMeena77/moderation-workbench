import { beforeEach, describe, expect, it } from 'vitest';
import { getAiConfig } from '@/server/ai/aiConfig';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db';
import { claimNextJob, enqueue, RETRY_DELAYS_MS } from '@/server/jobs/queue';
import { runPendingJobs } from '@/server/jobs/runner';
import { createPost } from '@/server/services/content';
import { actorFor, installPolicy } from './helpers/moderation';
import { createUser } from './helpers/users';

// The database job queue and runner (OPS-4) and the S2 rule-only analysis it produces (DET-5).

async function queueJob(dedupeKey: string, payload: Record<string, string> = { caseId: 'none', reason: 'initial' }) {
  await getDb().$transaction((tx) => enqueue(tx, { type: 'analyze', payload, dedupeKey }));
  return getDb().job.findUniqueOrThrow({ where: { dedupeKey } });
}

async function postAs(body: string) {
  const author = await createUser('author');
  return createPost(actorFor(author), { body }, 'req-jobs-0001');
}

const failing = { analyze: async () => Promise.reject(new Error('database hiccup')) };

beforeEach(async () => {
  await installPolicy(1);
});

describe('analyse job (rules + mock AI)', () => {
  it('[DET-5] a post gets analysis seq 1 with stored rule findings and the AI result', async () => {
    const created = await postAs('You are a worthless idiot');
    const summary = await runPendingJobs();
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });

    const db = getDb();
    const analysis = await db.analysis.findFirstOrThrow({ where: { caseId: created.caseId } });
    expect(analysis).toMatchObject({ seq: 1, policyVersion: 1, reason: 'initial', aiStatus: 'ok' });
    expect(analysis.aiRunId).toEqual((await db.aiRun.findFirstOrThrow()).id);
    expect(analysis.aiFindings).toMatchObject({ findings: [expect.objectContaining({ clauseCode: 'HAR-1' })] });
    expect(analysis.ruleFindings).toEqual([
      {
        ruleId: 'keyword',
        clauseCode: 'HAR-1',
        evidenceType: 'confirmed',
        quotes: [
          { text: 'worthless', start: 10, end: 19 },
          { text: 'idiot', start: 20, end: 25 },
        ],
        confidence: 1,
        severity: 'medium',
      },
    ]);
    expect(analysis.recommendation).toMatchObject({ action: 'label', needsHuman: true, autoClear: false });

    const kase = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(kase).toMatchObject({ status: 'awaiting_review', currentAnalysisId: analysis.id, priority: 55 });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'analysis.created' } });
    expect(event).toMatchObject({ actorType: 'system', actorId: null, entityId: analysis.id, policyVersion: 1 });
    expect(await db.job.findFirstOrThrow()).toMatchObject({ status: 'succeeded', attempts: 1, lockedUntil: null });
  });

  it('[HUM-1] an analysis that recommends removal never changes the content visibility', async () => {
    const created = await postAs("I'm going to hurt you");
    await runPendingJobs();
    const db = getDb();
    const analysis = await db.analysis.findFirstOrThrow();
    expect(analysis.recommendation).toMatchObject({ action: 'remove', alwaysEscalate: true, priority: 100 });
    expect((await db.content.findUniqueOrThrow({ where: { id: created.id } })).visibility).toBe('visible');
  });

  it('[DET-5] a job without an active policy fails as an infrastructure error and is retried', async () => {
    await postAs('Some post');
    await getDb().policy.deleteMany();
    const summary = await runPendingJobs();
    expect(summary).toMatchObject({ claimed: 1, requeued: 1 });
    const job = await getDb().job.findFirstOrThrow();
    expect(job.lastError).toMatch(/No active policy/);
  });
});

describe('job queue', () => {
  it('[OPS-4] enqueueing is idempotent by dedupeKey', async () => {
    await queueJob('analyze:x:initial:1:a');
    await queueJob('analyze:x:initial:1:a');
    expect(await getDb().job.count()).toBe(1);
  });

  it('[OPS-4] a claim marks the job running, counts the attempt and sets a lease of JOB_LEASE_MS', async () => {
    const job = await queueJob('lease-test');
    const before = Date.now();
    const claimed = await claimNextJob(getConfig().jobs.leaseMs);
    expect(claimed).toMatchObject({ id: job.id, type: 'analyze', attempts: 1, maxAttempts: 3 });
    const row = await getDb().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('running');
    const lease = (row.lockedUntil?.getTime() ?? 0) - before;
    // Database and test clocks differ slightly; the lease is about JOB_LEASE_MS from now.
    expect(Math.abs(lease - getConfig().jobs.leaseMs)).toBeLessThan(10_000);
    expect(await claimNextJob(getConfig().jobs.leaseMs)).toBeNull();
  });

  it('[OPS-4] a stuck job is re-claimed once its lease has expired, and not before', async () => {
    const job = await queueJob('stuck-test');
    const db = getDb();
    await db.job.update({
      where: { id: job.id },
      data: { status: 'running', attempts: 1, lockedUntil: new Date(Date.now() + 60_000) },
    });
    expect(await claimNextJob(1000)).toBeNull();
    await db.job.update({ where: { id: job.id }, data: { lockedUntil: new Date(Date.now() - 60_000) } });
    expect(await claimNextJob(1000)).toMatchObject({ id: job.id, attempts: 2 });
  });

  it('[OPS-4] concurrent claims never get the same job (FOR UPDATE SKIP LOCKED)', async () => {
    await queueJob('concurrent-a');
    await queueJob('concurrent-b');
    const claims = await Promise.all([claimNextJob(60_000), claimNextJob(60_000), claimNextJob(60_000)]);
    const ids = claims.filter((c) => c !== null).map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('[OPS-4] a failing job is retried after 30 s and then 2 min, and fails with an audit event after 3 attempts', async () => {
    const job = await queueJob('retry-test');
    const db = getDb();
    // The database clock decides what is due, so the back-off is skipped with the database's now().
    const makeDue = () =>
      db.$executeRaw`UPDATE "Job" SET "runAfter" = now() - interval '1 second' WHERE "id" = ${job.id}`;

    for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
      const started = Date.now();
      expect(await runPendingJobs({ handlers: failing })).toMatchObject({ claimed: 1, requeued: 1 });
      const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row).toMatchObject({ status: 'queued', attempts: attempt + 1, lastError: 'Error: database hiccup' });
      expect(Math.abs(row.runAfter.getTime() - started - delay)).toBeLessThan(5_000);
      // Not due yet: nothing to claim until the back-off has passed.
      expect(await runPendingJobs({ handlers: failing })).toMatchObject({ claimed: 0 });
      await makeDue();
    }

    expect(await runPendingJobs({ handlers: failing })).toMatchObject({ claimed: 1, failed: 1 });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'failed', attempts: 3 });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'job.failed', entityId: job.id } });
    expect(event).toMatchObject({ actorType: 'system', after: { attempts: 3, lastError: 'Error: database hiccup' } });
    // Attempts are capped: a failed job is never claimed again.
    expect(await runPendingJobs({ handlers: failing })).toMatchObject({ claimed: 0 });
  });

  it('[OPS-4] a job whose runner died on its last attempt is failed, not left running forever', async () => {
    const job = await queueJob('exhausted-test');
    const db = getDb();
    await db.job.update({
      where: { id: job.id },
      data: { status: 'running', attempts: 3, lockedUntil: new Date(Date.now() - 60_000) },
    });
    expect(await runPendingJobs()).toMatchObject({ exhausted: 1, claimed: 0 });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'failed',
      lastError: 'Lease expired on the last attempt.',
    });
    expect(await db.auditEvent.count({ where: { action: 'job.failed', entityId: job.id } })).toBe(1);
  });

  it('[OPS-4] a tick stops starting jobs when its budget cannot fit a full AI deadline', async () => {
    await queueJob('budget-test');
    const summary = await runPendingJobs({ budgetMs: getAiConfig().bounds.deadlineMs });
    expect(summary.claimed).toBe(0);
    expect((await getDb().job.findFirstOrThrow()).status).toBe('queued');
  });
});
