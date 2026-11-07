import type { AiStatus, CaseStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../db';
import type { ModerationSettings } from '../ai/aiConfig';
import type { ClassifyInput, ClassifyResult } from '../ai/classify';
import { contentFingerprint, getLogger } from '../logger';
import { combine, type Recommendation } from '../moderation/combine';
import type { ActivePolicy } from '../policy/schema';
import { runRules, type RecentItem, type RuleFinding } from '../rules';
import { REPEAT_WINDOW_MS } from '../rules/repeat';
import { append, type Tx } from './audit';
import { requireActivePolicy } from './policy';

// The analyse job's work (docs/02-system-design.md sec. 6, "Analyse job"). Called only by
// src/server/jobs/handlers.ts. Rules, then the AI (classify), then combine(). It never touches
// Content.visibility (HUM-1): only services/visibility.ts may.

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
  | {
      status: 'created';
      analysisId: string;
      seq: number;
      caseStatus: CaseStatus;
      recommendation: Recommendation;
      aiStatus: AiStatus;
      aiRunId: string;
    }
  | { status: 'skipped'; caseStatus: CaseStatus | null; aiRunId: string | null };

function nextStatus(current: CaseStatus, recommendation: Recommendation): CaseStatus {
  // An appealed case keeps its status; the new analysis is shown to the appeal reviewer (02 sec. 6).
  if (current === 'appealed') return current;
  return recommendation.autoClear ? 'auto_cleared' : 'awaiting_review';
}

/** What the case page shows of the AI side: the verified output plus what verification changed. */
function storedAiFindings(ai: ClassifyResult): Prisma.InputJsonObject | undefined {
  if (!ai.output) return undefined;
  return {
    ...ai.output,
    verification: ai.verification,
    injectionSignals: ai.injectionSignals,
  } as unknown as Prisma.InputJsonObject;
}

export interface PreparedAnalysis {
  ctx: AnalysisContext;
  ruleFindings: RuleFinding[];
  /** The input for classify(). The job handler makes the AI call: services never call the LLM (02 sec. 2). */
  classifyInput: ClassifyInput;
}

/** Step 1 of the analyse job: read the case without a lock and run the rules, or skip a closed case. */
export async function prepareAnalysis(caseId: string): Promise<PreparedAnalysis | { skipped: CaseStatus }> {
  const ctx = await loadAnalysisContext(getDb(), caseId);
  if (!ctx) throw new Error(`Case ${caseId} does not exist.`);
  if (!ANALYSABLE.includes(ctx.caseStatus)) return { skipped: ctx.caseStatus };
  const ruleFindings: RuleFinding[] = runRules(ctx.content.body, ctx.policy, {
    createdAt: ctx.content.createdAt,
    recentByAuthor: ctx.recentByAuthor,
  });
  return {
    ctx,
    ruleFindings,
    classifyInput: {
      policy: ctx.policy,
      content: { id: ctx.content.id, type: ctx.content.type, text: ctx.content.body },
      parentText: ctx.parent?.body ?? null,
      reportReasons: ctx.reportReasons,
      ruleFindings,
      // The author's last final actions come from decisions, which arrive in S4.
      authorHistory: [],
    },
  };
}

/**
 * Step 3 of the analyse job, after the AI step (which ran outside any transaction and wrote its own AiRun row):
 * one short transaction locks the case, re-reads its status and report count, combines, and inserts Analysis
 * seq + 1. An AI failure is not an error here: the analysis keeps the rule findings and goes to a human.
 */
export async function recordAnalysis(
  payload: z.infer<typeof analyzePayloadSchema>,
  prepared: PreparedAnalysis,
  ai: ClassifyResult,
  settings: ModerationSettings,
  requestId: string | null = null,
): Promise<AnalysisResult> {
  const { ctx, ruleFindings } = prepared;
  const log = getLogger().child({ caseId: ctx.caseId, requestId });
  const result = await getDb().$transaction(
    async (tx): Promise<AnalysisResult> => {
      // Serialises analyses of one case, so two jobs cannot both insert the same seq.
      await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${ctx.caseId} FOR UPDATE`;
      const kase = await tx.case.findUnique({
        where: { id: ctx.caseId },
        select: { status: true, reportCount: true },
      });
      if (!kase) throw new Error(`Case ${ctx.caseId} does not exist.`);
      // A human may have decided while the AI was running; the AiRun stays recorded, the case is left alone.
      if (!ANALYSABLE.includes(kase.status)) return { status: 'skipped', caseStatus: kase.status, aiRunId: ai.aiRunId };

      const recommendation = combine({
        policy: ctx.policy,
        ruleFindings,
        ai,
        reportCount: kase.reportCount,
        settings,
      });

      const last = await tx.analysis.aggregate({ where: { caseId: ctx.caseId }, _max: { seq: true } });
      const seq = (last._max.seq ?? 0) + 1;
      const aiFindings = storedAiFindings(ai);
      const analysis = await tx.analysis.create({
        data: {
          caseId: ctx.caseId,
          seq,
          policyVersion: ctx.policy.version,
          reason: payload.reason,
          ruleFindings: ruleFindings as unknown as Prisma.InputJsonArray,
          ...(aiFindings ? { aiFindings } : {}),
          recommendation: recommendation as unknown as Prisma.InputJsonObject,
          aiStatus: ai.status,
          aiRunId: ai.aiRunId,
        },
        select: { id: true },
      });

      // Status and priority only. Visibility is never touched here (HUM-1).
      const caseStatus = nextStatus(kase.status, recommendation);
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
        before: { caseStatus: kase.status },
        after: {
          caseId: ctx.caseId,
          seq,
          reason: payload.reason,
          caseStatus,
          action: recommendation.action,
          needsHuman: recommendation.needsHuman,
          autoClear: recommendation.autoClear,
          priority: recommendation.priority,
          ruleFindings: ruleFindings.length,
          aiStatus: ai.status,
          aiRunId: ai.aiRunId,
        },
        policyVersion: ctx.policy.version,
        requestId,
      });
      return {
        status: 'created',
        analysisId: analysis.id,
        seq,
        caseStatus,
        recommendation,
        aiStatus: ai.status,
        aiRunId: ai.aiRunId,
      };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  if (result.status === 'skipped') {
    log.info({ event: 'analysis.skipped', caseStatus: result.caseStatus, aiRunId: result.aiRunId });
  } else {
    log.info({
      event: 'analysis.created',
      analysisId: result.analysisId,
      seq: result.seq,
      policyVersion: ctx.policy.version,
      ruleFindings: ruleFindings.length,
      aiStatus: result.aiStatus,
      aiRunId: result.aiRunId,
      action: result.recommendation.action,
      needsHuman: result.recommendation.needsHuman,
      content: contentFingerprint(ctx.content.body),
    });
  }
  return result;
}
