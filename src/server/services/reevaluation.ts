import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { getLogger } from '../logger';
import { append, type Tx } from './audit';

// Re-evaluation runs (docs/02-system-design.md sec. 6, POL-3). publishPolicy() creates the run and its jobs; the
// job queue reports each job's outcome here inside the transaction that completes or fails the job, so the
// counters can never drift from the job rows. Re-analysis itself is the ordinary analyse job.

export type RunState = 'running' | 'finished' | 'finished_with_failures';

export interface ReevaluationRunView {
  id: string;
  fromVersion: number;
  toVersion: number;
  total: number;
  done: number;
  failed: number;
  state: RunState;
  createdAt: string;
  finishedAt: string | null;
}

interface RunRow {
  id: string;
  fromVersion: number;
  toVersion: number;
  total: number;
  done: number;
  failed: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export function toRunView(row: RunRow): ReevaluationRunView {
  const state: RunState =
    row.done + row.failed < row.total ? 'running' : row.failed > 0 ? 'finished_with_failures' : 'finished';
  return {
    id: row.id,
    fromVersion: row.fromVersion,
    toVersion: row.toVersion,
    total: row.total,
    done: row.done,
    failed: row.failed,
    state,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/**
 * Adds one finished item to a run, in the caller's transaction (the one that marks the job succeeded or failed).
 * A single UPDATE, so concurrent runners cannot lose an increment; finishedAt is set by whichever update
 * completes the count.
 */
export async function recordRunOutcome(tx: Tx, runId: string, outcome: 'done' | 'failed'): Promise<void> {
  const doneInc = outcome === 'done' ? 1 : 0;
  const failedInc = outcome === 'failed' ? 1 : 0;
  await tx.$executeRaw`
    UPDATE "ReevaluationRun"
    SET "done" = "done" + ${doneInc},
        "failed" = "failed" + ${failedInc},
        "finishedAt" = CASE WHEN "done" + "failed" + 1 >= "total" THEN now() ELSE "finishedAt" END
    WHERE "id" = ${runId}`;
}

export async function getRun(id: string, db: Tx | PrismaClient = getDb()): Promise<ReevaluationRunView> {
  const row = await db.reevaluationRun.findUnique({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', 'Re-evaluation run not found.');
  return toRunView(row);
}

/**
 * Retry failed (POL-3): every failed job of the run goes back to `queued` with attempts = 0 (the same rows, so
 * dedupeKeys stay unique), and the run's failed count is reduced by the same number in one transaction.
 * Retrying a run with no failed items is a no-op that returns the run unchanged.
 */
export async function retryFailed(
  actor: Actor,
  id: string,
  requestId: string,
): Promise<{ run: ReevaluationRunView; retried: number }> {
  const result = await getDb().$transaction(async (tx) => {
    // Serialises retries of one run against each other and against the queue's counter updates.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ReevaluationRun" WHERE "id" = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new AppError('NOT_FOUND', 'Re-evaluation run not found.');

    const retried = await tx.$executeRaw`
      UPDATE "Job"
      SET "status" = 'queued', "attempts" = 0, "lockedUntil" = NULL, "runAfter" = now(), "updatedAt" = now()
      WHERE "runId" = ${id} AND "status" = 'failed'`;
    if (retried > 0) {
      await tx.$executeRaw`
        UPDATE "ReevaluationRun"
        SET "failed" = GREATEST("failed" - ${retried}, 0), "finishedAt" = NULL
        WHERE "id" = ${id}`;
      await append(tx, {
        actorId: actor.id,
        actorType: 'human',
        action: 'reevaluation.retried',
        entityType: 'reevaluation',
        entityId: id,
        after: { retried },
        requestId,
      });
    }
    return { run: await getRun(id, tx), retried };
  });
  getLogger().info({ event: 'reevaluation.retried', runId: id, retried: result.retried, requestId, userId: actor.id });
  return result;
}
