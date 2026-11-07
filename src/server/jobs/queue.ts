import { randomUUID } from 'node:crypto';
import type { JobType, Prisma } from '@prisma/client';
import { getDb } from '../db';
import { append, type Tx } from '../services/audit';

// Database-backed job queue (docs/02-system-design.md sec. 6, OPS-4). Jobs are enqueued inside the
// transaction of the change that needs them, claimed with FOR UPDATE SKIP LOCKED under a lease, retried with
// back-off on infrastructure errors, and failed (with an audit event) once attempts run out.

export interface AnalyzePayload {
  caseId: string;
  reason: 'initial' | 'report' | 'reanalyze' | 'policy_change';
}

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/** Re-queue delays after a failed attempt: +30 s, then +2 min (02 sec. 6). */
export const RETRY_DELAYS_MS = [30_000, 120_000] as const;

/** analyze:{caseId}:{reason}:{policyVersion}:{triggerId} (02 sec. 6). */
export function analyzeDedupeKey(
  caseId: string,
  reason: AnalyzePayload['reason'],
  policyVersion: number | null,
  triggerId: string,
): string {
  return `analyze:${caseId}:${reason}:${policyVersion ?? 'none'}:${triggerId}`;
}

/** One brief per appeal (AI-12): appeal_brief:{appealId}. */
export function appealBriefDedupeKey(appealId: string): string {
  return `appeal_brief:${appealId}`;
}

/**
 * Idempotent: a second enqueue with the same dedupeKey is a no-op. Every queue timestamp (runAfter,
 * lockedUntil) comes from the database clock: Prisma would fill @default(now()) from the app server's
 * clock, and a server running ahead of the database would leave fresh jobs "not yet due".
 */
export async function enqueue(
  tx: Tx,
  job: { type: JobType; payload: Prisma.InputJsonObject; dedupeKey: string },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "Job" ("id", "type", "payload", "dedupeKey", "runAfter", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${job.type}::"JobType", ${JSON.stringify(job.payload)}::jsonb, ${job.dedupeKey},
            now(), now(), now())
    ON CONFLICT ("dedupeKey") DO NOTHING`;
}

/**
 * Claims one runnable job: queued and due, or running with an expired lease (its runner died). Attempts are
 * counted at claim time, so a job that keeps killing its runner still runs out of attempts.
 */
export async function claimNextJob(leaseMs: number): Promise<ClaimedJob | null> {
  const rows = await getDb().$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET "status" = 'running',
        "attempts" = "attempts" + 1,
        "lockedUntil" = now() + make_interval(secs => ${leaseMs}::double precision / 1000.0),
        "updatedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "Job"
      WHERE "attempts" < "maxAttempts"
        AND (("status" = 'queued' AND "runAfter" <= now())
          OR ("status" = 'running' AND "lockedUntil" < now()))
      ORDER BY "runAfter"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
  return rows[0] ?? null;
}

/** A cheap check for the polling endpoints: is there anything a runner could claim right now? */
export async function hasRunnableJobs(): Promise<boolean> {
  const rows = await getDb().$queryRaw<Array<{ one: number }>>`
    SELECT 1 AS one FROM "Job"
    WHERE "attempts" < "maxAttempts"
      AND (("status" = 'queued' AND "runAfter" <= now()) OR ("status" = 'running' AND "lockedUntil" < now()))
    LIMIT 1`;
  return rows.length > 0;
}

export async function completeJob(id: string): Promise<void> {
  await getDb().job.updateMany({
    where: { id, status: 'running' },
    data: { status: 'succeeded', lockedUntil: null, lastError: null },
  });
}

/** Error text stored on the job: bounded, and never a stack trace. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, 500);
}

/**
 * After a failed attempt: re-queue with back-off, or mark the job failed and audit it once its attempts are
 * used up. Returns the job's new status.
 */
export async function failJobAttempt(job: ClaimedJob, error: unknown): Promise<'queued' | 'failed'> {
  const lastError = describeError(error);
  if (job.attempts < job.maxAttempts) {
    const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 120_000;
    await getDb().$executeRaw`
      UPDATE "Job"
      SET "status" = 'queued', "lockedUntil" = NULL, "lastError" = ${lastError},
          "runAfter" = now() + make_interval(secs => ${delay}::double precision / 1000.0), "updatedAt" = now()
      WHERE "id" = ${job.id} AND "status" = 'running'`;
    return 'queued';
  }
  await markFailed(job.id, job.type, job.attempts, lastError);
  return 'failed';
}

async function markFailed(id: string, type: JobType, attempts: number, lastError: string): Promise<void> {
  await getDb().$transaction(async (tx) => {
    await tx.job.update({ where: { id }, data: { status: 'failed', lockedUntil: null, lastError } });
    await append(tx, {
      actorId: null,
      actorType: 'system',
      action: 'job.failed',
      entityType: 'job',
      entityId: id,
      after: { type, attempts, lastError },
    });
  });
}

/**
 * Jobs whose runner died on their last allowed attempt can never be claimed again (attempts = maxAttempts),
 * so they are failed here instead of staying "running" forever. Returns how many were failed.
 */
export async function failExhaustedJobs(): Promise<number> {
  const lastError = 'Lease expired on the last attempt.';
  return getDb().$transaction(async (tx) => {
    // One UPDATE ... RETURNING: two runners doing this at once cannot both fail (and audit) the same job.
    const failed = await tx.$queryRaw<Array<{ id: string; type: JobType; attempts: number }>>`
      UPDATE "Job"
      SET "status" = 'failed', "lockedUntil" = NULL, "lastError" = ${lastError}, "updatedAt" = now()
      WHERE "status" = 'running' AND "lockedUntil" < now() AND "attempts" >= "maxAttempts"
      RETURNING "id", "type", "attempts"`;
    for (const job of failed) {
      await append(tx, {
        actorId: null,
        actorType: 'system',
        action: 'job.failed',
        entityType: 'job',
        entityId: job.id,
        after: { type: job.type, attempts: job.attempts, lastError },
      });
    }
    return failed.length;
  });
}
