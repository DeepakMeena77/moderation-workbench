import type {
  AiStatus,
  CaseStatus,
  CaseTrigger,
  ContentType,
  Prisma,
  PrismaClient,
  Role,
  Visibility,
} from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { analyzeDedupeKey, enqueue } from '../jobs/queue';
import { getLogger } from '../logger';
import type { PolicyChange } from '../policy/diff';
import { clausesSchema, MOD_ACTIONS, SEVERITIES, type ModAction, type Severity } from '../policy/schema';
import { append, type Tx } from './audit';
import { getActivePolicy, policyChangeNotice } from './policy';
import { enforceRateLimit, type RateLimitRule } from './rateLimit';

// The moderation queue and the case page (Q-1, Q-3, Q-4; docs/02-system-design.md sec. 7). Reads the stored
// Analysis as it is: rule findings, the recommendation (02 sec. 5.6) and the AI status. AI findings and AI run
// details are optional: an analysis written before the AI step (or with the AI unavailable) has none, and the
// page says "AI review pending or unavailable" instead of failing. Stored JSON is parsed leniently here, field by
// field, so one malformed entry hides that entry, not the whole case.

export const QUEUE_STATUSES = ['awaiting_review', 'pending_analysis', 'auto_cleared'] as const;
export const QUEUE_TRIGGERS = ['new_content', 'report', 'reopen'] as const;
export const QUEUE_AI = ['ok', 'unavailable'] as const;

const DECIDER_ROLES: ReadonlySet<Role> = new Set(['moderator', 'senior_moderator']);
/** The analyse job only updates these (services/analysis.ts); re-analysing anything else would be skipped. */
const REANALYSABLE: readonly CaseStatus[] = ['pending_analysis', 'awaiting_review', 'appealed'];

/** SEC-4: re-analyse, 10 per minute per moderator. */
export const REANALYZE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

const CLAUSE_CODE = /^[A-Za-z]{2,6}-\d{1,3}$/;
export const EXCERPT_CHARS = 160;

// --- Stored analysis JSON, parsed leniently ---

const severity = z.enum(SEVERITIES);
const action = z.enum(MOD_ACTIONS);

/** The recommendation shape of 02 sec. 5.6. Every field has a safe default so older or partial rows still read. */
export const recommendationSchema = z.object({
  action: action.catch('none'),
  severity: severity.nullable().catch(null),
  confidence: z.number().min(0).max(1).nullable().catch(null),
  needsHuman: z.boolean().catch(true),
  reasons: z.array(z.string()).catch([]),
  autoClear: z.boolean().catch(false),
  priority: z.number().catch(0),
  clauseCodes: z.array(z.string()).catch([]),
});

export type RecommendationView = z.infer<typeof recommendationSchema>;

export function parseRecommendation(value: unknown): RecommendationView {
  return recommendationSchema.parse(typeof value === 'object' && value !== null ? value : {});
}

const quoteSpan = z.object({ text: z.string(), start: z.number().int().min(0), end: z.number().int().min(0) });

const ruleFindingSchema = z.object({
  ruleId: z.string(),
  clauseCode: z.string(),
  quotes: z.array(quoteSpan).catch([]),
  severity,
  confidence: z.number().catch(1),
});

// S3 stores verified AI findings; quotes may be verified spans or plain strings (unverified).
const aiFindingSchema = z.object({
  clauseCode: z.string(),
  evidenceType: z.enum(['confirmed', 'interpretation']),
  quotes: z.array(z.union([quoteSpan, z.string()])).catch([]),
  interpretation: z.string().catch(''),
  severity,
  severityReason: z.string().catch(''),
  confidence: z.number().min(0).max(1),
  confidenceReason: z.string().catch(''),
});

const verificationSchema = z.object({
  invalidCitations: z.array(z.string()).catch([]),
  unverifiedQuotes: z.array(z.string()).catch([]),
  actionLowered: z.object({ from: action, to: action }).nullable().catch(null),
});

const aiEnvelopeSchema = z.object({
  findings: z.array(z.unknown()).catch([]),
  verification: verificationSchema.nullable().catch(null),
  overallSeverity: severity.nullable().catch(null),
  severityReason: z.string().nullable().catch(null),
  confidenceReason: z.string().nullable().catch(null),
  insufficientContext: z.boolean().catch(false),
});

export interface FindingView {
  source: 'rule' | 'ai';
  /** rule id ("keyword") for rule findings, null for AI findings. */
  ruleId: string | null;
  clauseCode: string;
  evidenceType: 'confirmed' | 'interpretation';
  quotes: Array<{ text: string; start: number | null; end: number | null }>;
  interpretation: string | null;
  severity: Severity;
  severityReason: string | null;
  confidence: number;
  confidenceReason: string | null;
}

export interface AiDetailView {
  findings: FindingView[];
  invalidCitations: string[];
  unverifiedQuotes: string[];
  actionLowered: { from: ModAction; to: ModAction } | null;
  severityReason: string | null;
  confidenceReason: string | null;
  insufficientContext: boolean;
}

function parseList<S extends z.ZodTypeAny>(value: unknown, schema: S): Array<z.infer<S>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Array<z.infer<S>> => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data as z.infer<S>] : [];
  });
}

export function parseRuleFindings(value: unknown): FindingView[] {
  return parseList(value, ruleFindingSchema).map((f) => ({
    source: 'rule',
    ruleId: f.ruleId,
    clauseCode: f.clauseCode,
    evidenceType: 'confirmed',
    quotes: f.quotes,
    interpretation: null,
    severity: f.severity,
    severityReason: null,
    confidence: f.confidence,
    confidenceReason: null,
  }));
}

/** null when the analysis has no AI result (not run yet, or unavailable). */
export function parseAiDetail(value: unknown): AiDetailView | null {
  if (value === null || value === undefined) return null;
  const envelope = aiEnvelopeSchema.safeParse(Array.isArray(value) ? { findings: value } : value);
  if (!envelope.success) return null;
  const e = envelope.data;
  return {
    findings: parseList(e.findings, aiFindingSchema).map((f) => ({
      source: 'ai',
      ruleId: null,
      clauseCode: f.clauseCode,
      evidenceType: f.evidenceType,
      quotes: f.quotes.map((q) => (typeof q === 'string' ? { text: q, start: null, end: null } : q)),
      interpretation: f.interpretation || null,
      severity: f.severity,
      severityReason: f.severityReason || null,
      confidence: f.confidence,
      confidenceReason: f.confidenceReason || null,
    })),
    invalidCitations: e.verification?.invalidCitations ?? [],
    unverifiedQuotes: e.verification?.unverifiedQuotes ?? [],
    actionLowered: e.verification?.actionLowered ?? null,
    severityReason: e.severityReason,
    confidenceReason: e.confidenceReason,
    insufficientContext: e.insufficientContext,
  };
}

// --- Queue list (Q-1) ---

export const caseListQuerySchema = z.object({
  status: z.enum(QUEUE_STATUSES).default('awaiting_review'),
  severity: severity.optional(),
  /** "report" also matches cases opened for new content that were reported later. */
  trigger: z.enum(QUEUE_TRIGGERS).optional(),
  policy: z.coerce.number().int().positive().optional(),
  ai: z.enum(QUEUE_AI).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export interface CaseRow {
  id: string;
  status: CaseStatus;
  trigger: CaseTrigger;
  priority: number;
  reportCount: number;
  createdAt: string;
  content: { id: string; type: ContentType; excerpt: string; authorName: string };
  analysis: {
    seq: number;
    policyVersion: number;
    aiStatus: AiStatus;
    action: ModAction;
    severity: Severity | null;
    clauseCodes: string[];
  } | null;
}

export interface CaseListPage {
  items: CaseRow[];
  total: number;
  nextCursor: string | null;
}

function listWhere(query: CaseListQuery): Prisma.CaseWhereInput {
  const and: Prisma.CaseWhereInput[] = [{ status: query.status }];
  const analysis: Prisma.AnalysisWhereInput[] = [];
  if (query.severity) analysis.push({ recommendation: { path: ['severity'], equals: query.severity } });
  if (query.policy) analysis.push({ policyVersion: query.policy });
  if (query.ai === 'ok') analysis.push({ aiStatus: 'ok' });
  if (query.ai === 'unavailable') analysis.push({ aiStatus: { not: 'ok' } });
  if (analysis.length > 0) and.push({ currentAnalysis: { is: { AND: analysis } } });
  if (query.trigger === 'report') and.push({ OR: [{ trigger: 'report' }, { reportCount: { gt: 0 } }] });
  else if (query.trigger) and.push({ trigger: query.trigger });
  if (query.q) {
    const text: Prisma.CaseWhereInput[] = [
      { content: { body: { contains: query.q, mode: 'insensitive' } } },
      { content: { author: { name: { contains: query.q, mode: 'insensitive' } } } },
    ];
    if (CLAUSE_CODE.test(query.q)) {
      const code = query.q.toUpperCase();
      text.push({ currentAnalysis: { is: { recommendation: { path: ['clauseCodes'], array_contains: [code] } } } });
    }
    and.push({ OR: text });
  }
  return { AND: and };
}

export async function listCases(query: CaseListQuery): Promise<CaseListPage> {
  const db = getDb();
  const where = listWhere(query);
  const [rows, total] = await Promise.all([
    db.case.findMany({
      where,
      // Q-1: priority, then age (oldest first); the id makes the order total, so cursor pages never overlap.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        trigger: true,
        priority: true,
        reportCount: true,
        createdAt: true,
        content: { select: { id: true, type: true, body: true, author: { select: { name: true } } } },
        currentAnalysis: { select: { seq: true, policyVersion: true, aiStatus: true, recommendation: true } },
      },
    }),
    db.case.count({ where }),
  ]);
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((row) => {
      const rec = row.currentAnalysis ? parseRecommendation(row.currentAnalysis.recommendation) : null;
      return {
        id: row.id,
        status: row.status,
        trigger: row.trigger,
        priority: row.priority,
        reportCount: row.reportCount,
        createdAt: row.createdAt.toISOString(),
        content: {
          id: row.content.id,
          type: row.content.type,
          excerpt: row.content.body.slice(0, EXCERPT_CHARS),
          authorName: row.content.author.name,
        },
        analysis:
          row.currentAnalysis && rec
            ? {
                seq: row.currentAnalysis.seq,
                policyVersion: row.currentAnalysis.policyVersion,
                aiStatus: row.currentAnalysis.aiStatus,
                action: rec.action,
                severity: rec.severity,
                clauseCodes: rec.clauseCodes,
              }
            : null,
      };
    }),
    total,
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

// --- Case detail ---

export interface ClauseView {
  code: string;
  title: string;
  text: string;
  defaultSeverity: Severity;
  defaultAction: ModAction;
  allowedActions: ModAction[];
}

/** AiRun fields shown on the case page (AI-10). */
export interface AiRunView {
  provider: string;
  model: string;
  modelsTried: string[];
  fallbackUsed: boolean;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
  attempts: number;
  parseStrategy: string | null;
  repairUsed: boolean;
  status: AiStatus;
  errorCode: string | null;
}

export interface AnalysisView {
  id: string;
  seq: number;
  policyVersion: number;
  reason: string;
  createdAt: string;
  aiStatus: AiStatus;
  recommendation: RecommendationView;
  ruleFindings: FindingView[];
  ai: AiDetailView | null;
  aiRun: AiRunView | null;
}

export interface DecisionView {
  id: string;
  kind: 'approve' | 'reject' | 'modify';
  decider: { id: string; name: string };
  analysisSeq: number;
  policyVersion: number;
  recommendedAction: ModAction;
  finalAction: ModAction;
  clauseCodes: string[];
  reasonCategory: string | null;
  rationale: string | null;
  createdAt: string;
  /** POL-4: set when a newer policy version is active than the one this decision was made under. */
  policyChange: PolicyChange | null;
}

export interface CaseDetail {
  id: string;
  status: CaseStatus;
  trigger: CaseTrigger;
  priority: number;
  reportCount: number;
  createdAt: string;
  content: {
    id: string;
    type: ContentType;
    body: string;
    createdAt: string;
    visibility: Visibility;
    author: { id: string; name: string };
    parent: { id: string; body: string; authorName: string } | null;
  };
  /** Counts only: reporter identities never leave the server (CNT-3e). */
  reportReasons: Array<{ reason: string; count: number }>;
  analysis: AnalysisView | null;
  versions: Array<{
    id: string;
    seq: number;
    policyVersion: number;
    reason: string;
    aiStatus: AiStatus;
    action: ModAction;
    createdAt: string;
  }>;
  decision: DecisionView | null;
  /** A queued or running analyse job: the page polls and explains the wait. */
  analysisPending: boolean;
  /** Clauses of the policy version the current analysis used (or the active policy before the first one). */
  policy: { version: number; clauses: ClauseView[] } | null;
  permissions: { canDecide: boolean; canReanalyze: boolean; canReopen: boolean; readOnly: boolean };
}

async function policyClauses(tx: Tx | PrismaClient, version: number | null): Promise<CaseDetail['policy']> {
  const row = version
    ? await tx.policy.findUnique({ where: { version }, select: { version: true, clauses: true } })
    : await tx.policy.findFirst({ where: { status: 'active' }, select: { version: true, clauses: true } });
  if (!row) return null;
  const clauses = clausesSchema.parse(row.clauses).map((c) => ({
    code: c.code,
    title: c.title,
    text: c.text,
    defaultSeverity: c.defaultSeverity,
    defaultAction: c.defaultAction,
    allowedActions: [...c.allowedActions],
  }));
  return { version: row.version, clauses };
}

/** The AI run behind an analysis, for the "AI run details" panel. null when no AI step ran. */
async function loadAiRun(aiRunId: string | null): Promise<AiRunView | null> {
  if (!aiRunId) return null;
  const run = await getDb().aiRun.findUnique({ where: { id: aiRunId } });
  if (!run) {
    getLogger().warn({ event: 'case.ai_run_missing', aiRunId });
    return null;
  }
  return {
    provider: run.provider,
    model: run.model,
    modelsTried: run.modelsTried,
    fallbackUsed: run.fallbackUsed,
    promptVersion: run.promptVersion,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    thinkingTokens: run.thinkingTokens,
    costUsd: Number(run.costUsd),
    latencyMs: run.latencyMs,
    attempts: run.attempts,
    parseStrategy: run.parseStrategy,
    repairUsed: run.repairUsed,
    status: run.status,
    errorCode: run.errorCode,
  };
}

export async function getCase(actor: Actor, caseId: string): Promise<CaseDetail> {
  const db = getDb();
  const row = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      status: true,
      trigger: true,
      priority: true,
      reportCount: true,
      createdAt: true,
      currentAnalysisId: true,
      content: {
        select: {
          id: true,
          type: true,
          body: true,
          createdAt: true,
          visibility: true,
          author: { select: { id: true, name: true } },
          parent: { select: { id: true, body: true, author: { select: { name: true } } } },
        },
      },
      analyses: {
        orderBy: { seq: 'desc' },
        select: {
          id: true,
          seq: true,
          policyVersion: true,
          reason: true,
          aiStatus: true,
          recommendation: true,
          createdAt: true,
        },
      },
      decisions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          kind: true,
          policyVersion: true,
          recommendedAction: true,
          finalAction: true,
          clauseCodes: true,
          reasonCategory: true,
          rationale: true,
          createdAt: true,
          decider: { select: { id: true, name: true } },
          analysis: { select: { seq: true } },
        },
      },
    },
  });
  if (!row) throw new AppError('NOT_FOUND', 'This case does not exist.');

  const current = row.currentAnalysisId ? await db.analysis.findUnique({ where: { id: row.currentAnalysisId } }) : null;
  const latest = row.decisions[0];
  const [reasons, pendingJobs, policy, aiRun, policyChange] = await Promise.all([
    db.report.groupBy({ by: ['reason'], where: { contentId: row.content.id }, _count: { _all: true } }),
    db.job.count({
      where: { type: 'analyze', status: { in: ['queued', 'running'] }, payload: { path: ['caseId'], equals: row.id } },
    }),
    policyClauses(db, current?.policyVersion ?? null),
    loadAiRun(current?.aiRunId ?? null),
    latest ? policyChangeNotice(latest.policyVersion, db) : Promise.resolve(null),
  ]);

  const decider = DECIDER_ROLES.has(actor.role);
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    priority: row.priority,
    reportCount: row.reportCount,
    createdAt: row.createdAt.toISOString(),
    content: {
      id: row.content.id,
      type: row.content.type,
      body: row.content.body,
      createdAt: row.content.createdAt.toISOString(),
      visibility: row.content.visibility,
      author: row.content.author,
      parent: row.content.parent
        ? { id: row.content.parent.id, body: row.content.parent.body, authorName: row.content.parent.author.name }
        : null,
    },
    reportReasons: reasons
      .map((r) => ({ reason: r.reason, count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    analysis: current
      ? {
          id: current.id,
          seq: current.seq,
          policyVersion: current.policyVersion,
          reason: current.reason,
          createdAt: current.createdAt.toISOString(),
          aiStatus: current.aiStatus,
          recommendation: parseRecommendation(current.recommendation),
          ruleFindings: parseRuleFindings(current.ruleFindings),
          ai: parseAiDetail(current.aiFindings),
          aiRun,
        }
      : null,
    versions: row.analyses.map((a) => ({
      id: a.id,
      seq: a.seq,
      policyVersion: a.policyVersion,
      reason: a.reason,
      aiStatus: a.aiStatus,
      action: parseRecommendation(a.recommendation).action,
      createdAt: a.createdAt.toISOString(),
    })),
    decision: latest
      ? {
          id: latest.id,
          kind: latest.kind,
          decider: latest.decider,
          analysisSeq: latest.analysis.seq,
          policyVersion: latest.policyVersion,
          recommendedAction: latest.recommendedAction,
          finalAction: latest.finalAction,
          clauseCodes: latest.clauseCodes,
          reasonCategory: latest.reasonCategory,
          rationale: latest.rationale,
          createdAt: latest.createdAt.toISOString(),
          policyChange,
        }
      : null,
    analysisPending: pendingJobs > 0,
    policy,
    permissions: {
      canDecide: decider && row.status === 'awaiting_review' && current !== null,
      canReanalyze: decider && REANALYSABLE.includes(row.status),
      canReopen: decider && row.status === 'auto_cleared',
      readOnly: !decider,
    },
  };
}

// --- Re-analyse and reopen (Q-4) ---

function requireDecider(actor: Actor): void {
  if (!DECIDER_ROLES.has(actor.role)) throw new AppError('FORBIDDEN', "You don't have access to this.");
}

async function lockCase(tx: Tx, caseId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR UPDATE`;
  const kase = await tx.case.findUnique({ where: { id: caseId }, select: { id: true, status: true } });
  if (!kase) throw new AppError('NOT_FOUND', 'This case does not exist.');
  return kase;
}

/** Queues a new analysis (a new version, seq + 1); the case keeps its status until the job writes it. */
export async function requestReanalysis(actor: Actor, caseId: string, requestId: string): Promise<{ queued: true }> {
  requireDecider(actor);
  await enforceRateLimit(
    `reanalyze:${actor.id}`,
    REANALYZE_LIMIT,
    (wait) => `You're re-analysing quickly. Try again in ${wait}.`,
  );
  await getDb().$transaction(async (tx) => {
    const kase = await lockCase(tx, caseId);
    if (!REANALYSABLE.includes(kase.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        kase.status === 'auto_cleared'
          ? 'This case was auto-cleared. Reopen it before re-analysing.'
          : 'This case is already decided, so it cannot be re-analysed.',
      );
    }
    const policy = await getActivePolicy(tx);
    const policyVersion = policy?.version ?? null;
    await enqueue(tx, {
      type: 'analyze',
      payload: { caseId, reason: 'reanalyze' },
      dedupeKey: analyzeDedupeKey(caseId, 'reanalyze', policyVersion, requestId),
    });
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'analysis.requested',
      entityType: 'case',
      entityId: caseId,
      after: { reason: 'reanalyze', status: kase.status },
      policyVersion,
      requestId,
    });
  });
  getLogger().info({ event: 'analysis.requested', requestId, userId: actor.id, caseId });
  return { queued: true };
}

/** auto_cleared -> awaiting_review (01 sec. 4). Visibility is untouched: auto-clear never changed it. */
export async function reopenCase(actor: Actor, caseId: string, requestId: string): Promise<{ status: CaseStatus }> {
  requireDecider(actor);
  await getDb().$transaction(async (tx) => {
    const kase = await lockCase(tx, caseId);
    if (kase.status !== 'auto_cleared') {
      throw new AppError('INVALID_TRANSITION', 'Only an auto-cleared case can be reopened.');
    }
    await tx.case.update({ where: { id: caseId }, data: { status: 'awaiting_review', trigger: 'reopen' } });
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'case.reopened',
      entityType: 'case',
      entityId: caseId,
      before: { status: kase.status },
      after: { status: 'awaiting_review', trigger: 'reopen' },
      requestId,
    });
  });
  getLogger().info({ event: 'case.reopened', requestId, userId: actor.id, caseId });
  return { status: 'awaiting_review' };
}
