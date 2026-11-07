import type { AiStatus } from '@prisma/client';
import { getAiConfig } from '../ai/aiConfig';
import { getConfig } from '../config';
import { getDb } from '../db';
import { getLogger } from '../logger';

// System checks for /status and /api/health (docs/02-system-design.md sec. 11). The page checks the whole
// journey, not only the web process: app, database, LLM, background jobs, the active policy and AI usage.
// Nothing here calls the LLM: the LLM check reads recent AiRun rows, so viewing the page never spends quota.

export type CheckState = 'ok' | 'warn' | 'fail';

export type CheckName = 'app' | 'database' | 'llm' | 'jobs' | 'policy' | 'aiUsage';

export interface CheckResult {
  check: CheckName;
  state: CheckState;
  detail: Record<string, string | number | null>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A queued job older than this means the runner is not being kicked. */
export const JOB_QUEUE_WARN_S = 120;

// ---- Pure state rules (unit-tested) -------------------------------------------------------------------------

export function llmState(input: {
  provider: 'gemini' | 'mock';
  hasKey: boolean;
  production: boolean;
  lastThreeStatuses: string[];
  callsToday: number;
  maxCallsPerDay: number;
}): { state: CheckState; reason: string | null } {
  if (input.provider === 'mock' && input.production) return { state: 'fail', reason: 'mock AI in production' };
  if (input.provider === 'gemini' && !input.hasKey) return { state: 'fail', reason: 'no Gemini API key' };
  if (input.lastThreeStatuses.length === 3 && input.lastThreeStatuses.every((s) => s !== 'ok')) {
    return { state: 'warn', reason: 'the last 3 AI runs failed' };
  }
  if (input.maxCallsPerDay > 0 && input.callsToday >= 0.8 * input.maxCallsPerDay) {
    return { state: 'warn', reason: 'daily AI budget above 80%' };
  }
  return { state: 'ok', reason: null };
}

export function jobsState(input: { stuck: number; oldestQueuedS: number | null }): {
  state: CheckState;
  reason: string | null;
} {
  if (input.stuck > 0) return { state: 'fail', reason: `${input.stuck} job(s) stuck past their lease` };
  if (input.oldestQueuedS !== null && input.oldestQueuedS > JOB_QUEUE_WARN_S) {
    return { state: 'warn', reason: `oldest queued job waiting ${input.oldestQueuedS} s` };
  }
  return { state: 'ok', reason: null };
}

export function aiUsageState(input: { calls: number; failures: number }): CheckState {
  return input.calls >= 4 && input.failures / input.calls > 0.5 ? 'warn' : 'ok';
}

export interface StatusReport {
  overall: CheckState;
  checkedAt: string;
  checks: CheckResult[];
}

export interface Health {
  ok: boolean;
  db: 'connected' | 'unreachable';
  version: string;
}

export type DatabaseProbe = () => Promise<unknown>;

// Each check has its own timeout, so one slow dependency cannot hang the status page.
export const CHECK_TIMEOUT_MS = 2000;

const defaultProbe: DatabaseProbe = () => getDb().$queryRaw`SELECT 1`;

class CheckTimeout extends Error {}

export async function checkDatabase(
  probe: DatabaseProbe = defaultProbe,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new CheckTimeout()), timeoutMs);
      }),
    ]);
    return { check: 'database', state: 'ok', detail: { latencyMs: Math.round(performance.now() - started) } };
  } catch (error) {
    const reason = error instanceof CheckTimeout ? 'timeout' : 'unreachable';
    getLogger().warn({
      event: 'status.db_check_failed',
      reason,
      err: error instanceof CheckTimeout ? undefined : error,
    });
    return { check: 'database', state: 'fail', detail: { latencyMs: null, reason } };
  } finally {
    clearTimeout(timer);
  }
}

export function checkApp(): CheckResult {
  const { release } = getConfig();
  return {
    check: 'app',
    state: 'ok',
    detail: {
      release: release.commitSha ?? 'local',
      buildTime: release.buildTime,
      uptimeS: Math.round(process.uptime()),
    },
  };
}

function worst(states: CheckState[]): CheckState {
  if (states.includes('fail')) return 'fail';
  if (states.includes('warn')) return 'warn';
  return 'ok';
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const AI_STATUS_WORDS: Record<AiStatus, string> = {
  ok: 'OK',
  timeout: 'Timed out',
  rate_limited: 'Rate limited',
  invalid_output: 'Invalid output',
  invalid_input: 'Input over budget',
  provider_error: 'Provider error',
  budget_exhausted: 'Daily budget reached',
  unavailable: 'Unavailable',
};

/** "Invalid output (invalid after repair)": the status page shows words, never a bare code (03 sec. 7). */
export function describeAiError(status: AiStatus, errorCode: string | null): string {
  const words = AI_STATUS_WORDS[status];
  return errorCode ? `${words} (${errorCode.replace(/_/g, ' ')})` : words;
}

export async function checkLlm(now: Date = new Date()): Promise<CheckResult> {
  const ai = getAiConfig();
  const db = getDb();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [recent, lastOk, lastError, today] = await Promise.all([
    db.aiRun.findMany({ orderBy: { createdAt: 'desc' }, take: 3, select: { status: true } }),
    db.aiRun.findFirst({ where: { status: 'ok' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    db.aiRun.findFirst({
      where: { status: { not: 'ok' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, status: true, errorCode: true },
    }),
    db.aiRun.aggregate({ where: { createdAt: { gte: startOfDay } }, _sum: { attempts: true } }),
  ]);
  const callsToday = today._sum.attempts ?? 0;
  const { state, reason } = llmState({
    provider: ai.provider,
    hasKey: Boolean(ai.geminiApiKey),
    production: getConfig().nodeEnv === 'production',
    lastThreeStatuses: recent.map((r) => r.status),
    callsToday,
    maxCallsPerDay: ai.bounds.maxCallsPerDay,
  });
  return {
    check: 'llm',
    state,
    detail: {
      provider: ai.provider,
      model: ai.primaryModel,
      fallbackModel: ai.fallbackModel,
      lastSuccess: iso(lastOk?.createdAt),
      lastError: lastError ? describeAiError(lastError.status, lastError.errorCode) : null,
      lastErrorAt: iso(lastError?.createdAt),
      callsToday: `${callsToday} / ${ai.bounds.maxCallsPerDay}`,
      reason,
    },
  };
}

export async function checkJobs(now: Date = new Date()): Promise<CheckResult> {
  const db = getDb();
  const [queued, running, failed24h, stuck, oldest] = await Promise.all([
    db.job.count({ where: { status: 'queued' } }),
    db.job.count({ where: { status: 'running' } }),
    db.job.count({ where: { status: 'failed', updatedAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    db.job.count({ where: { status: 'running', lockedUntil: { lt: now } } }),
    db.job.findFirst({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  const oldestQueuedS = oldest ? Math.max(0, Math.round((now.getTime() - oldest.createdAt.getTime()) / 1000)) : null;
  const { state, reason } = jobsState({ stuck, oldestQueuedS });
  return {
    check: 'jobs',
    state,
    detail: { queued, running, failed24h, stuck, oldestQueuedS, reason },
  };
}

export async function checkPolicy(): Promise<CheckResult> {
  const active = await getDb().policy.findFirst({
    where: { status: 'active' },
    select: { version: true, publishedAt: true },
  });
  return active
    ? { check: 'policy', state: 'ok', detail: { activeVersion: active.version, publishedAt: iso(active.publishedAt) } }
    : { check: 'policy', state: 'fail', detail: { activeVersion: null, reason: 'no active policy' } };
}

export async function checkAiUsage(now: Date = new Date()): Promise<CheckResult> {
  const since = new Date(now.getTime() - DAY_MS);
  const db = getDb();
  const [totals, failures] = await Promise.all([
    db.aiRun.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, thinkingTokens: true, costUsd: true },
      _avg: { latencyMs: true },
    }),
    db.aiRun.count({ where: { createdAt: { gte: since }, status: { not: 'ok' } } }),
  ]);
  const calls = totals._count._all;
  return {
    check: 'aiUsage',
    state: aiUsageState({ calls, failures }),
    detail: {
      runs24h: calls,
      failed24h: failures,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: (totals._sum.outputTokens ?? 0) + (totals._sum.thinkingTokens ?? 0),
      costUsd: Number(totals._sum.costUsd ?? 0).toFixed(4),
      avgLatencyMs: totals._avg.latencyMs === null ? null : Math.round(totals._avg.latencyMs),
    },
  };
}

/** Runs a check; if it throws (for example a query fails), it is reported as failing instead. */
async function guarded(check: CheckName, run: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await run();
  } catch (error) {
    getLogger().warn({ event: 'status.check_failed', check, err: error });
    return { check, state: 'fail', detail: { reason: 'check could not run' } };
  }
}

export async function getStatusReport(probe?: DatabaseProbe): Promise<StatusReport> {
  const database = await checkDatabase(probe);
  const checks = [checkApp(), database];
  if (database.state === 'ok') {
    checks.push(
      ...(await Promise.all([
        guarded('llm', () => checkLlm()),
        guarded('jobs', () => checkJobs()),
        guarded('policy', () => checkPolicy()),
        guarded('aiUsage', () => checkAiUsage()),
      ])),
    );
  }
  return { overall: worst(checks.map((c) => c.state)), checkedAt: new Date().toISOString(), checks };
}

export async function getHealth(probe?: DatabaseProbe): Promise<Health> {
  const database = await checkDatabase(probe);
  const ok = database.state === 'ok';
  return { ok, db: ok ? 'connected' : 'unreachable', version: getConfig().release.commitSha ?? 'local' };
}
