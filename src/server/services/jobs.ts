import { timingSafeEqual } from 'node:crypto';
import type { JobType } from '@prisma/client';
import type { Actor } from '../auth/session';
import { getConfig } from '../config';
import { getDb } from '../db';
import { AppError } from '../errors';
import { runPendingJobs, type RunSummary } from '../jobs/runner';
import { getLogger } from '../logger';
import { append } from './audit';

// Operator controls for the job queue (docs/02-system-design.md sec. 6 "Ticks", OPS-4): the admin's Process
// pending and Retry buttons on /status, and the external cron tick.

export interface FailedJob {
  id: string;
  type: JobType;
  attempts: number;
  maxAttempts: number;
  /** The sanitised error the last attempt recorded. */
  lastError: string | null;
  failedAt: string;
  /** The case an analyze job was for; null for other job types. */
  caseId: string | null;
}

export interface FailedJobList {
  items: FailedJob[];
  total: number;
}

const FAILED_LIST_LIMIT = 20;

function caseIdOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('caseId' in payload)) return null;
  const value = (payload as { caseId: unknown }).caseId;
  return typeof value === 'string' ? value : null;
}

/** The most recently failed jobs, newest first, for the admin panel on /status. */
export async function listFailedJobs(): Promise<FailedJobList> {
  const db = getDb();
  const [rows, total] = await Promise.all([
    db.job.findMany({ where: { status: 'failed' }, orderBy: { updatedAt: 'desc' }, take: FAILED_LIST_LIMIT }),
    db.job.count({ where: { status: 'failed' } }),
  ]);
  return {
    items: rows.map((job) => ({
      id: job.id,
      type: job.type,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      failedAt: job.updatedAt.toISOString(),
      caseId: caseIdOf(job.payload),
    })),
    total,
  };
}

/**
 * Puts one failed job back in the queue: the same row, status queued, attempts 0, due now (database clock).
 * A job that belongs to a re-evaluation run gives back its "failed" count, as Retry failed on the run does.
 */
export async function retryJob(actor: Actor, id: string, requestId: string): Promise<{ id: string; status: 'queued' }> {
  await getDb().$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id }, select: { runId: true } });
    if (!job) throw new AppError('NOT_FOUND', 'Job not found.');
    // Same lock order as reevaluation.retryFailed (run, then its jobs), so the two never deadlock.
    if (job.runId) await tx.$queryRaw`SELECT "id" FROM "ReevaluationRun" WHERE "id" = ${job.runId} FOR UPDATE`;
    const locked = await tx.$queryRaw<Array<{ status: string; type: JobType; attempts: number }>>`
      SELECT "status", "type", "attempts" FROM "Job" WHERE "id" = ${id} FOR UPDATE`;
    const current = locked[0];
    if (!current) throw new AppError('NOT_FOUND', 'Job not found.');
    if (current.status !== 'failed') {
      throw new AppError('INVALID_TRANSITION', 'Only a failed job can be retried.', { status: current.status });
    }
    await tx.$executeRaw`
      UPDATE "Job"
      SET "status" = 'queued', "attempts" = 0, "lockedUntil" = NULL, "runAfter" = now(), "updatedAt" = now()
      WHERE "id" = ${id}`;
    if (job.runId) {
      await tx.$executeRaw`
        UPDATE "ReevaluationRun" SET "failed" = GREATEST("failed" - 1, 0), "finishedAt" = NULL
        WHERE "id" = ${job.runId}`;
    }
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'job.retried',
      entityType: 'job',
      entityId: id,
      before: { status: 'failed', attempts: current.attempts },
      after: { status: 'queued', type: current.type },
      requestId,
    });
  });
  getLogger().info({ event: 'job.retried', jobId: id, requestId, userId: actor.id });
  return { id, status: 'queued' };
}

/** Process pending (admin) and the cron tick: one runner pass within the job budget, run in the request. */
export async function processPendingJobs(): Promise<RunSummary> {
  return runPendingJobs();
}

/** The cron tick's shared-secret check, in constant time. A missing or short CRON_SECRET disables the tick. */
export function checkCronSecret(header: string | null): void {
  const expected = getConfig().jobs.cronSecret;
  if (!expected) throw new AppError('NOT_FOUND', 'Not found.');
  const given = Buffer.from(header ?? '', 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    throw new AppError('UNAUTHENTICATED', 'A valid x-cron-secret header is required.');
  }
}
