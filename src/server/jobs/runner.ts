import { after } from 'next/server';
import type { Logger } from 'pino';
import { getAiConfig } from '../ai/aiConfig';
import { getConfig } from '../config';
import { getLogger } from '../logger';
import { HANDLERS, type JobHandler } from './handlers';
import type { JobType } from '@prisma/client';
import { claimNextJob, completeJob, failExhaustedJobs, failJobAttempt, hasRunnableJobs } from './queue';

// The job runner (docs/02-system-design.md sec. 6, OPS-4). It runs inside a request's after() callback, so it
// has a wall-clock budget below the route's maxDuration, and starts a job only while enough budget is left
// for a full AI pipeline run, so the platform never kills a job half way.

export const MAX_JOBS_PER_TICK = 10;
const START_MARGIN_MS = 5000;

export interface RunOptions {
  handlers?: Partial<Record<JobType, JobHandler>>;
  budgetMs?: number;
  maxJobs?: number;
}

export interface RunSummary {
  claimed: number;
  succeeded: number;
  requeued: number;
  failed: number;
  exhausted: number;
}

export async function runPendingJobs(options: RunOptions = {}): Promise<RunSummary> {
  const config = getConfig();
  const handlers = { ...HANDLERS, ...options.handlers };
  const budgetMs = options.budgetMs ?? config.jobs.budgetMs;
  const maxJobs = options.maxJobs ?? MAX_JOBS_PER_TICK;
  const log = getLogger().child({ component: 'job-runner' });
  // AI_DEADLINE_MS has one source: the AI settings (src/server/ai/aiConfig.ts).
  const aiDeadlineMs = getAiConfig().bounds.deadlineMs;
  const started = Date.now();
  const summary: RunSummary = { claimed: 0, succeeded: 0, requeued: 0, failed: 0, exhausted: 0 };

  summary.exhausted = await failExhaustedJobs();
  if (summary.exhausted > 0) log.warn({ event: 'job.failed', reason: 'lease_expired', count: summary.exhausted });

  while (summary.claimed < maxJobs) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < aiDeadlineMs + START_MARGIN_MS) break;
    const job = await claimNextJob(config.jobs.leaseMs);
    if (!job) break;
    summary.claimed += 1;
    log.info({ event: 'job.claimed', jobId: job.id, type: job.type, attempt: job.attempts });
    const jobStarted = Date.now();
    try {
      await handlers[job.type](job);
      await completeJob(job);
      summary.succeeded += 1;
      log.info({ event: 'job.succeeded', jobId: job.id, type: job.type, durationMs: Date.now() - jobStarted });
    } catch (error) {
      const status = await failJobAttempt(job, error);
      if (status === 'failed') summary.failed += 1;
      else summary.requeued += 1;
      log[status === 'failed' ? 'error' : 'warn']({
        event: status === 'failed' ? 'job.failed' : 'job.retry',
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        err: error,
      });
    }
  }
  return summary;
}

/**
 * Runs pending jobs after the response is sent (02 sec. 6 "Ticks"). Mutations that enqueue work and the
 * polling endpoints call this; the cheap check means a quiet system does no more than one small query.
 */
export function kickJobRunner(log: Logger): void {
  const tick = async () => {
    try {
      if (await hasRunnableJobs()) await runPendingJobs();
    } catch (error) {
      log.error({ event: 'job.tick_failed', err: error });
    }
  };
  try {
    after(tick);
  } catch (error) {
    // Outside a Next.js request (scripts, direct handler calls in tests) there is no after(); the next
    // request, the cron tick or Process pending picks the work up instead.
    log.warn({ event: 'job.kick_skipped', reason: error instanceof Error ? error.message : String(error) });
  }
}
