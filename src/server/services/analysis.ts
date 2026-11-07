import type { CaseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../db';
import { contentFingerprint, getLogger } from '../logger';
import { combine, RULE_ONLY_REASON, type Recommendation } from '../moderation/combine';
import type { ActivePolicy } from '../policy/schema';
import { runRules, type RecentItem, type RuleFinding } from '../rules';
import { REPEAT_WINDOW_MS } from '../rules/repeat';
import { append, type Tx } from './audit';
import { requireActivePolicy } from './policy';

// The analyse job's work (docs/02-system-design.md sec. 6, "Analyse job"). Called only by
// src/server/jobs/handlers.ts. S2 stores a rule-only analysis; S3 adds the AI step in runAnalysis between
// the rules and combine(). It never touches Content.visibility (HUM-1): only services/visibility.ts may.

export const ANALYSIS_REASONS = ['initial', 'report', 'reanalyze', 'policy_change'] as const;
export type AnalysisReason = (typeof ANALYSIS_REASONS)[number];

export const analyzePayloadSchema = z.object({
  caseId: z.string().min(1),
  reason: z.enum(ANALYSIS_REASONS),
});

/** Cases a new analysis may update. Others (resolved, auto-cleared...) are left as they are. */
const ANALYSABLE: readonly CaseStatus[] = ['pending_analysis', 'awaiting_review', 'appealed'];

/** Everything the analysis looks at for one case. The AI prompt (S3) is built from the same object. */
export interface AnalysisContext {
  caseId: string;
  caseStatus: CaseStatus;
  reportCount: number;
  content: { id: string; type: 'post' | 'comment'; body: string; authorId: string; createdAt: Date };
  /** CNT-2: a comment is analysed with its parent post as context. */
  parent: { id: string; body: string } | null;
  recentByAuthor: RecentItem[];
  /** Report reasons with counts only; reporter identities never reach the analysis. */
  reportReasons: Record<string, number>;
  policy: ActivePolicy;
}

export async function loadAnalysisContext(tx: Tx, caseId: string): Promise<AnalysisContext | null> {
  const row = await tx.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      reportCount: true,
      content: {
        select: {
          id: true,
          type: true,
          body: true,
          authorId: true,
          createdAt: true,
          parent: { select: { id: true, body: true } },
        },
      },
    },
  });
  if (!row) return null;
  const { content } = row;
  const [recent, reasons, policy] = await Promise.all([
    tx.content.findMany({
      where: {
        authorId: content.authorId,
        id: { not: content.id },
        createdAt: { gte: new Date(content.createdAt.getTime() - REPEAT_WINDOW_MS), lte: content.createdAt },
      },
      select: { body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    tx.report.groupBy({ by: ['reason'], where: { contentId: content.id }, _count: { _all: true } }),
    requireActivePolicy(tx),
  ]);
  return {
    caseId: row.id,
    caseStatus: row.status,
    reportCount: row.reportCount,
    content: {
      id: content.id,
      type: content.type,
      body: content.body,
      authorId: content.authorId,
      createdAt: content.createdAt,
    },
    parent: content.parent,
    recentByAuthor: recent,
    reportReasons: Object.fromEntries(reasons.map((r) => [r.reason, r._count._all])),
    policy,
  };
}

export type AnalysisResult =
  | { status: 'created'; analysisId: string; seq: number; caseStatus: CaseStatus; recommendation: Recommendation }
  | { status: 'skipped'; caseStatus: CaseStatus | null };

function nextStatus(current: CaseStatus, recommendation: Recommendation): CaseStatus {
  // An appealed case keeps its status; the new analysis is shown to the appeal reviewer (02 sec. 6).
  if (current === 'appealed') return current;
  return recommendation.autoClear ? 'auto_cleared' : 'awaiting_review';
}

export async function runAnalysis(payload: z.infer<typeof analyzePayloadSchema>): Promise<AnalysisResult> {
  const log = getLogger().child({ caseId: payload.caseId });
  const result = await getDb().$transaction(
    async (tx): Promise<AnalysisResult> => {
      // Serialises analyses of one case, so two jobs cannot both insert the same seq.
      await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${payload.caseId} FOR UPDATE`;
      const ctx = await loadAnalysisContext(tx, payload.caseId);
      if (!ctx) throw new Error(`Case ${payload.caseId} does not exist.`);
      if (!ANALYSABLE.includes(ctx.caseStatus)) return { status: 'skipped', caseStatus: ctx.caseStatus };

      const ruleFindings: RuleFinding[] = runRules(ctx.content.body, ctx.policy, {
        createdAt: ctx.content.createdAt,
        recentByAuthor: ctx.recentByAuthor,
      });
      const recommendation = combine({
        policy: ctx.policy,
        ruleFindings,
        reportCount: ctx.reportCount,
        ai: { status: 'unavailable', reason: RULE_ONLY_REASON },
      });

      const last = await tx.analysis.aggregate({ where: { caseId: ctx.caseId }, _max: { seq: true } });
      const seq = (last._max.seq ?? 0) + 1;
      const analysis = await tx.analysis.create({
        data: {
          caseId: ctx.caseId,
          seq,
          policyVersion: ctx.policy.version,
          reason: payload.reason,
          ruleFindings: ruleFindings as unknown as Prisma.InputJsonArray,
          recommendation: recommendation as unknown as Prisma.InputJsonObject,
          aiStatus: 'unavailable',
        },
        select: { id: true },
      });

      const caseStatus = nextStatus(ctx.caseStatus, recommendation);
      await tx.case.update({
        where: { id: ctx.caseId },
        data: { currentAnalysisId: analysis.id, status: caseStatus, priority: recommendation.priority },
      });
      await append(tx, {
        actorId: null,
        actorType: 'system',
        action: 'analysis.created',
        entityType: 'analysis',
        entityId: analysis.id,
        before: { caseStatus: ctx.caseStatus },
        after: {
          caseId: ctx.caseId,
          seq,
          reason: payload.reason,
          caseStatus,
          action: recommendation.action,
          needsHuman: recommendation.needsHuman,
          priority: recommendation.priority,
          ruleFindings: ruleFindings.length,
          aiStatus: 'unavailable',
        },
        policyVersion: ctx.policy.version,
      });
      log.info({
        event: 'analysis.created',
        analysisId: analysis.id,
        seq,
        policyVersion: ctx.policy.version,
        ruleFindings: ruleFindings.length,
        action: recommendation.action,
        content: contentFingerprint(ctx.content.body),
      });
      return { status: 'created', analysisId: analysis.id, seq, caseStatus, recommendation };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
  if (result.status === 'skipped') log.info({ event: 'analysis.skipped', caseStatus: result.caseStatus });
  return result;
}
