import type { AiStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as metricsRoute } from '@/app/api/metrics/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { createPost } from '@/server/services/content';
import { decide } from '@/server/services/decisions';
import { getMetrics } from '@/server/services/metrics';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// OPS-6: the metrics service and GET /api/metrics (docs/02-system-design.md sec. 11).

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

const HOUR = 3600_000;

beforeEach(async () => {
  await installPolicy(1);
});

async function analysedCase(body: string) {
  const author = await createUser('author');
  const created = await createPost(actorFor(author), { body }, 'req-metrics-01');
  await runPendingJobs();
  const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
  return { caseId: kase.id, analysisId: kase.currentAnalysisId ?? '' };
}

let runSeq = 0;
async function aiRun(status: AiStatus, latencyMs: number, createdAt: Date, tokens = 100, costUsd = 0.001) {
  runSeq += 1;
  await getDb().aiRun.create({
    data: {
      purpose: 'classify',
      provider: 'mock',
      model: 'mock-model',
      modelsTried: ['mock-model'],
      promptVersion: 'test',
      promptHash: `hash-${runSeq}`,
      inputTokens: tokens,
      outputTokens: 0,
      thinkingTokens: 0,
      costUsd,
      latencyMs,
      attempts: 1,
      repairUsed: false,
      fallbackUsed: false,
      trimmedContext: false,
      status,
      createdAt,
    },
  });
}

describe('metrics (OPS-6)', () => {
  it('[OPS-6] agreement counts decisions on AI-ok analyses that kept the recommended action; overrides by reason', async () => {
    const moderator = actorFor(await createUser('moderator'));
    const agreed = await analysedCase('You are a worthless idiot');
    const overridden = await analysedCase('You are a total idiot');
    const analyses = await getDb().analysis.findMany({ select: { aiStatus: true } });
    expect(analyses.every((a) => a.aiStatus === 'ok')).toBe(true);

    await decide(moderator, agreed.caseId, { kind: 'approve', analysisId: agreed.analysisId }, 'req-metrics-02');
    await decide(
      moderator,
      overridden.caseId,
      {
        kind: 'modify',
        analysisId: overridden.analysisId,
        finalAction: 'limit',
        clauseCodes: ['HAR-1'],
        reasonCategory: 'severity_too_low',
        rationale: 'Repeated insults at the same person.',
      },
      'req-metrics-03',
    );

    const metrics = await getMetrics();
    expect(metrics.agreement).toEqual({ decisions: 2, agreed: 1, rate: 0.5 });
    expect(metrics.overrides).toEqual({ total: 1, byReason: [{ reason: 'severity_too_low', count: 1 }] });
  });

  it('[OPS-6] AI failures by status, p50 and p90 latency, and tokens and cost by day', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - HOUR);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * HOUR);
    await aiRun('ok', 100, recent);
    await aiRun('ok', 200, recent);
    await aiRun('ok', 300, threeDaysAgo, 50, 0.0005);
    await aiRun('timeout', 1000, recent);
    // No provider call: counted as failures, left out of latency.
    await aiRun('invalid_input', 0, recent, 0, 0);
    await aiRun('budget_exhausted', 0, recent, 0, 0);
    // Outside the 7-day window.
    await aiRun('provider_error', 5000, new Date(now.getTime() - 10 * 24 * HOUR));

    const metrics = await getMetrics(now);
    expect(metrics.aiFailures.runs).toBe(6);
    expect(metrics.aiFailures.failed).toBe(3);
    expect(metrics.aiFailures.rate).toBe(0.5);
    expect(metrics.aiFailures.byStatus.map((s) => s.status).sort()).toEqual([
      'budget_exhausted',
      'invalid_input',
      'timeout',
    ]);
    // percentile_cont over 100, 200, 300, 1000.
    expect(metrics.latency).toEqual({ runs: 4, p50Ms: 250, p90Ms: 790 });

    expect(metrics.usage.last24h).toEqual({ runs: 5, tokens: 300, costUsd: 0.003 });
    expect(metrics.usage.last7d).toEqual({ runs: 6, tokens: 350, costUsd: 0.0035 });
    expect(metrics.usage.byDay).toHaveLength(7);
    expect(metrics.usage.byDay.at(-1)?.day).toBe(now.toISOString().slice(0, 10));
    const day = (d: Date) => metrics.usage.byDay.find((b) => b.day === d.toISOString().slice(0, 10));
    expect(day(threeDaysAgo)).toMatchObject({ runs: 1, tokens: 50, costUsd: 0.0005 });
    expect(metrics.usage.byDay.reduce((sum, d) => sum + d.runs, 0)).toBe(6);
  });

  it('[OPS-6] with no data every rate is null rather than a division by zero', async () => {
    const metrics = await getMetrics();
    expect(metrics.agreement.rate).toBeNull();
    expect(metrics.aiFailures.rate).toBeNull();
    expect(metrics.latency).toEqual({ runs: 0, p50Ms: null, p90Ms: null });
    expect(metrics.usage.byDay.every((d) => d.runs === 0 && d.costUsd === 0)).toBe(true);
  });

  it('[OPS-6] GET /api/metrics is for staff: authors get 403', async () => {
    const author = await createUser('author');
    const moderator = await createUser('moderator');
    const denied = await metricsRoute(apiRequest('/api/metrics', { cookie: await sessionCookieFor(author.id) }));
    expect(denied.status).toBe(403);
    const res = await metricsRoute(apiRequest('/api/metrics', { cookie: await sessionCookieFor(moderator.id) }));
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: { windowDays: number; usage: { byDay: unknown[] } } }>(res);
    expect(data.windowDays).toBe(7);
    expect(data.usage.byDay).toHaveLength(7);
  });
});
