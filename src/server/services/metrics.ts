import type { AiStatus, ReasonCategory } from '@prisma/client';
import { getDb } from '../db';

// The metrics page data (docs/02-system-design.md sec. 11, OPS-6). Read-only aggregates over decisions and AI
// runs; nothing here calls the AI. Days are UTC calendar days.

export const METRICS_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UsageTotals {
  runs: number;
  tokens: number;
  costUsd: number;
}

export interface Metrics {
  generatedAt: string;
  windowDays: number;
  /** Decisions on analyses where the AI answered (aiStatus ok): how often the human kept the recommended action. */
  agreement: { decisions: number; agreed: number; rate: number | null };
  /** Decisions that rejected or modified the recommendation, by the reason the moderator gave (HUM-3, HUM-4). */
  overrides: { total: number; byReason: Array<{ reason: ReasonCategory; count: number }> };
  /** AI runs by outcome; the rate is failed runs over all runs. */
  aiFailures: {
    runs: number;
    failed: number;
    rate: number | null;
    byStatus: Array<{ status: AiStatus; count: number }>;
  };
  /** Over runs that reached a provider (invalid_input and budget_exhausted make no call). */
  latency: { runs: number; p50Ms: number | null; p90Ms: number | null };
  usage: { last24h: UsageTotals; last7d: UsageTotals; byDay: Array<UsageTotals & { day: string }> };
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const money = (value: unknown) => Math.round(Number(value ?? 0) * 1e6) / 1e6;

export async function getMetrics(now: Date = new Date()): Promise<Metrics> {
  const db = getDb();
  // The window is the last 7 UTC calendar days, today included, so the totals match the bars by day.
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (METRICS_WINDOW_DAYS - 1) * DAY_MS,
  );
  const since24h = new Date(now.getTime() - DAY_MS);

  const [agreementRows, overrideTotal, reasons, statuses, latencyRows, dayRows, last24h] = await Promise.all([
    db.$queryRaw<Array<{ decisions: number; agreed: number }>>`
      SELECT count(*)::int AS decisions,
             count(*) FILTER (WHERE d."finalAction" = d."recommendedAction")::int AS agreed
      FROM "Decision" d JOIN "Analysis" a ON a."id" = d."analysisId"
      WHERE a."aiStatus" = 'ok' AND d."createdAt" >= ${since}`,
    db.decision.count({ where: { createdAt: { gte: since }, kind: { not: 'approve' } } }),
    db.decision.groupBy({
      by: ['reasonCategory'],
      where: { createdAt: { gte: since }, kind: { not: 'approve' }, reasonCategory: { not: null } },
      _count: { _all: true },
    }),
    db.aiRun.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.$queryRaw<Array<{ runs: number; p50: number | null; p90: number | null }>>`
      SELECT count(*)::int AS runs,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY "latencyMs") AS p90
      FROM "AiRun"
      WHERE "createdAt" >= ${since} AND "status" NOT IN ('invalid_input', 'budget_exhausted')`,
    db.$queryRaw<Array<{ day: Date; runs: number; tokens: number; cost: unknown }>>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS runs,
             sum("inputTokens" + "outputTokens" + "thinkingTokens")::int AS tokens, sum("costUsd") AS cost
      FROM "AiRun"
      WHERE "createdAt" >= ${since}
      GROUP BY 1`,
    db.aiRun.aggregate({
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, thinkingTokens: true, costUsd: true },
    }),
  ]);

  const agreement = agreementRows[0] ?? { decisions: 0, agreed: 0 };
  const runs = statuses.reduce((sum, s) => sum + s._count._all, 0);
  const failed = statuses.filter((s) => s.status !== 'ok').reduce((sum, s) => sum + s._count._all, 0);
  const latency = latencyRows[0];

  // Every day of the week appears, with zeros for days without runs, so the bar list keeps its shape.
  const byDayMap = new Map(dayRows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const byDay = Array.from({ length: METRICS_WINDOW_DAYS }, (_, i) => {
    const day = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const row = byDayMap.get(day);
    return { day, runs: row?.runs ?? 0, tokens: row?.tokens ?? 0, costUsd: money(row?.cost) };
  });
  const last7d = byDay.reduce<UsageTotals>(
    (sum, d) => ({ runs: sum.runs + d.runs, tokens: sum.tokens + d.tokens, costUsd: money(sum.costUsd + d.costUsd) }),
    { runs: 0, tokens: 0, costUsd: 0 },
  );

  return {
    generatedAt: now.toISOString(),
    windowDays: METRICS_WINDOW_DAYS,
    agreement: { ...agreement, rate: ratio(agreement.agreed, agreement.decisions) },
    overrides: {
      total: overrideTotal,
      byReason: reasons
        .flatMap((r) => (r.reasonCategory ? [{ reason: r.reasonCategory, count: r._count._all }] : []))
        .sort((a, b) => b.count - a.count),
    },
    aiFailures: {
      runs,
      failed,
      rate: ratio(failed, runs),
      byStatus: statuses
        .filter((s) => s.status !== 'ok')
        .map((s) => ({ status: s.status, count: s._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    latency: {
      runs: latency?.runs ?? 0,
      p50Ms: latency?.p50 == null ? null : Math.round(latency.p50),
      p90Ms: latency?.p90 == null ? null : Math.round(latency.p90),
    },
    usage: {
      last24h: {
        runs: last24h._count._all,
        tokens: (last24h._sum.inputTokens ?? 0) + (last24h._sum.outputTokens ?? 0) + (last24h._sum.thinkingTokens ?? 0),
        costUsd: money(last24h._sum.costUsd),
      },
      last7d,
      byDay,
    },
  };
}
