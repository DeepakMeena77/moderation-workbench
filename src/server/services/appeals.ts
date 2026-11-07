import type { AppealOutcome, AppealStatus, CaseStatus, ContentType, Role, Visibility } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getConfig } from '../config';
import { getDb } from '../db';
import { AppError } from '../errors';
import { appealBriefDedupeKey, enqueue } from '../jobs/queue';
import { getLogger } from '../logger';
import { clausesSchema, MOD_ACTIONS, type ModAction } from '../policy/schema';
import { parseStoredBrief } from './appealBriefs';
import { append, type Tx } from './audit';
import {
  EXCERPT_CHARS,
  parseAiDetail,
  parseRecommendation,
  parseRuleFindings,
  type ClauseView,
  type FindingView,
} from './cases';
import { MAX_RATIONALE_CHARS, MIN_RATIONALE_CHARS } from './decisions';
import { getActivePolicy } from './policy';
import { ACTION_VISIBILITY, setVisibility } from './visibility';

// Appeals and the second review (APP-1..5, docs/02-system-design.md sec. 8). The content author appeals a decision
// once, within APPEAL_WINDOW_DAYS, when it took an action. The appeal is routed to the least-loaded senior moderator
// who did not make the decision; any other senior may resolve it, never the original decider (SAME_REVIEWER).
// Resolving applies the outcome through setVisibility, the one visibility writer (HUM-1). The AI writes a neutral
// brief in the background (services/appealBriefs.ts) and never resolves anything (AI-12).

const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_STATEMENT_CHARS = 20;
export const MAX_STATEMENT_CHARS = 2000;
export const MAX_EVIDENCE_LINKS = 3;
export const MAX_LINK_CHARS = 500;
export const MAX_EVIDENCE_NOTE_CHARS = 1000;

const thousands = (n: number) => n.toLocaleString('en-US');

const STATEMENT_MESSAGE = `Explain your appeal in at least ${MIN_STATEMENT_CHARS} characters.`;
const LINK_MESSAGE = 'Enter a full link that starts with https:// or http://.';

/** Only http(s): a link is rendered as a clickable anchor, so javascript: and data: must never get through. */
function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

// APP-1: a statement of 20-2,000 characters, up to 3 links and an optional note. The messages are the UI copy.
export const appealInputSchema = z.object({
  statement: z
    .string({ required_error: STATEMENT_MESSAGE, invalid_type_error: STATEMENT_MESSAGE })
    .trim()
    .min(MIN_STATEMENT_CHARS, STATEMENT_MESSAGE)
    .max(MAX_STATEMENT_CHARS, `Keep it under ${thousands(MAX_STATEMENT_CHARS)} characters.`),
  evidenceLinks: z
    .array(z.string().trim().max(MAX_LINK_CHARS, LINK_MESSAGE).refine(isWebLink, LINK_MESSAGE))
    .max(MAX_EVIDENCE_LINKS, `Add at most ${MAX_EVIDENCE_LINKS} links.`)
    .default([])
    .transform((links) => [...new Set(links)]),
  evidenceNote: z
    .string()
    .trim()
    .max(MAX_EVIDENCE_NOTE_CHARS, `Keep the note under ${thousands(MAX_EVIDENCE_NOTE_CHARS)} characters.`)
    .optional()
    .transform((note) => note || null),
});

export type AppealInput = z.infer<typeof appealInputSchema>;

const RATIONALE_MESSAGE = `Explain the outcome in at least ${MIN_RATIONALE_CHARS} characters.`;
const resolveRationale = z
  .string({ required_error: RATIONALE_MESSAGE, invalid_type_error: RATIONALE_MESSAGE })
  .trim()
  .min(MIN_RATIONALE_CHARS, RATIONALE_MESSAGE)
  .max(MAX_RATIONALE_CHARS, `Keep it under ${thousands(MAX_RATIONALE_CHARS)} characters.`);

// APP-5: uphold, overturn or modify (with the new action), always with a rationale.
export const resolveInputSchema = z.discriminatedUnion(
  'outcome',
  [
    z.object({ outcome: z.literal('uphold'), rationale: resolveRationale }),
    z.object({ outcome: z.literal('overturn'), rationale: resolveRationale }),
    z.object({
      outcome: z.literal('modify'),
      finalAction: z.enum(MOD_ACTIONS, { errorMap: () => ({ message: 'Choose the new action.' }) }),
      rationale: resolveRationale,
    }),
  ],
  { errorMap: () => ({ message: 'Choose uphold, overturn or modify.' }) },
);

export type ResolveInput = z.infer<typeof resolveInputSchema>;

/** "21 Nov 2026", the date used in appeal messages. UTC, so the server's time zone never shifts it. */
export function formatDeadline(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function appealDeadline(decidedAt: Date, windowDays: number = getConfig().appeals.windowDays): Date {
  return new Date(decidedAt.getTime() + windowDays * DAY_MS);
}

export interface Appealability {
  canAppeal: boolean;
  /** ISO time the window closes; null when the decision took no action. */
  until: string | null;
  /** Plain reason when canAppeal is false. */
  reason: string | null;
}

/**
 * Whether the author may appeal this decision now (APP-1). Shared by My content, the feed and the create check,
 * so the button the author sees and the rule the server applies cannot drift apart.
 */
export function appealability(
  decision: { finalAction: ModAction; createdAt: Date; isLatest: boolean; hasAppeal: boolean },
  caseStatus: CaseStatus,
  now: Date = new Date(),
  windowDays: number = getConfig().appeals.windowDays,
): Appealability {
  if (decision.finalAction === 'none') {
    return { canAppeal: false, until: null, reason: 'No action was taken, so there is nothing to appeal.' };
  }
  const deadline = appealDeadline(decision.createdAt, windowDays);
  const until = deadline.toISOString();
  if (decision.hasAppeal) return { canAppeal: false, until, reason: 'You have already appealed this decision.' };
  if (now.getTime() > deadline.getTime()) {
    return { canAppeal: false, until, reason: `The appeal window closed on ${formatDeadline(deadline)}.` };
  }
  if (!decision.isLatest || caseStatus !== 'resolved') {
    return { canAppeal: false, until, reason: 'This item is being reviewed again.' };
  }
  return { canAppeal: true, until, reason: null };
}

// --- Plain language for the author (My content, history; 03 sec. 6.3 and 6.4) ---

const ACTION_PAST: Record<ModAction, string> = {
  none: 'took no action',
  label: 'labelled',
  limit: 'limited',
  remove: 'removed',
};

/** "HAR-1 (Harassment)"; just the code when the title is unknown. */
export function clauseList(codes: readonly string[], titles: ReadonlyMap<string, string>): string {
  return codes.map((code) => (titles.has(code) ? `${code} (${titles.get(code)})` : code)).join(', ');
}

/** "A moderator limited this under HAR-1 (Harassment)." No moderator name, rationale or AI detail. */
export function plainDecisionText(
  decision: { finalAction: ModAction; clauseCodes: readonly string[] },
  titles: ReadonlyMap<string, string>,
): string {
  if (decision.finalAction === 'none') return 'A moderator reviewed this and took no action.';
  const under = decision.clauseCodes.length > 0 ? ` under ${clauseList(decision.clauseCodes, titles)}` : '';
  return `A moderator ${ACTION_PAST[decision.finalAction]} this${under}.`;
}

/** The appeal's state for its author, in one or two plain sentences (APP-5). */
export function plainAppealText(appeal: {
  status: AppealStatus;
  outcome: AppealOutcome | null;
  finalAction: ModAction | null;
}): string {
  if (appeal.status === 'pending') return 'Appeal sent. A senior moderator will review it.';
  if (appeal.outcome === 'overturn') {
    return 'A senior moderator overturned the decision. Your content is visible again.';
  }
  if (appeal.outcome === 'modify' && appeal.finalAction) {
    return `A senior moderator changed the decision: your content is now ${ACTION_PAST[appeal.finalAction]}.`;
  }
  return 'A senior moderator reviewed your appeal and upheld the decision.';
}

// --- Create (APP-1, APP-2, APP-3 routing) ---

export interface CreatedAppeal {
  appealId: string;
  status: AppealStatus;
  /** False when no eligible senior moderator exists; the appeals list then shows a warning (APP-3). */
  assigned: boolean;
  deadline: string;
}

async function lockCase(tx: Tx, caseId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR UPDATE`;
}

/** The least-loaded senior moderator who is not the decider (pending assigned appeals; oldest account on ties). */
async function pickReviewer(tx: Tx, deciderId: string): Promise<string | null> {
  const seniors = await tx.user.findMany({
    where: { role: 'senior_moderator', id: { not: deciderId } },
    select: {
      id: true,
      createdAt: true,
      _count: { select: { assignedAppeals: { where: { status: 'pending' } } } },
    },
  });
  seniors.sort(
    (a, b) =>
      a._count.assignedAppeals - b._count.assignedAppeals ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return seniors[0]?.id ?? null;
}

export async function createAppeal(
  actor: Actor,
  decisionId: string,
  input: AppealInput,
  requestId: string,
  now: Date = new Date(),
): Promise<CreatedAppeal> {
  const db = getDb();
  const located = await db.decision.findUnique({ where: { id: decisionId }, select: { caseId: true } });
  if (!located) throw new AppError('NOT_FOUND', 'This decision does not exist.');

  const created = await db.$transaction(async (tx) => {
    // Serialises with decisions, reports and other appeals on the same case.
    await lockCase(tx, located.caseId);
    const decision = await tx.decision.findUniqueOrThrow({
      where: { id: decisionId },
      select: {
        id: true,
        caseId: true,
        deciderId: true,
        finalAction: true,
        policyVersion: true,
        createdAt: true,
        appeal: { select: { id: true } },
        case: {
          select: {
            status: true,
            content: { select: { id: true, authorId: true } },
            decisions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } },
          },
        },
      },
    });

    // APP-2 and SEC-2: only the author of the content may appeal its decision.
    if (decision.case.content.authorId !== actor.id) {
      getLogger().warn({ event: 'access.denied', requestId, userId: actor.id, decisionId, reason: 'not_author' });
      throw new AppError('FORBIDDEN', 'Only the author of this content can appeal its decision.');
    }
    if (decision.appeal) {
      throw new AppError('ALREADY_APPEALED', "You've already appealed this decision.", {
        appealId: decision.appeal.id,
      });
    }
    if (decision.finalAction === 'none') {
      throw new AppError('NOT_APPEALABLE', 'This decision took no action, so there is nothing to appeal.');
    }
    const deadline = appealDeadline(decision.createdAt);
    if (now.getTime() > deadline.getTime()) {
      throw new AppError('APPEAL_WINDOW_CLOSED', `The appeal window closed on ${formatDeadline(deadline)}.`, {
        deadline: deadline.toISOString(),
      });
    }
    // A new report reopens a resolved case (CNT-3f); its old decision is then superseded and not appealable.
    if (decision.case.status !== 'resolved' || decision.case.decisions[0]?.id !== decision.id) {
      throw new AppError(
        'INVALID_TRANSITION',
        'This item is being reviewed again. You can appeal the new decision once it is made.',
      );
    }

    const reviewerId = await pickReviewer(tx, decision.deciderId);
    const appeal = await tx.appeal.create({
      data: {
        decisionId: decision.id,
        caseId: decision.caseId,
        authorId: actor.id,
        statement: input.statement,
        evidenceLinks: input.evidenceLinks,
        evidenceNote: input.evidenceNote,
        assignedReviewerId: reviewerId,
      },
      select: { id: true, status: true },
    });
    await tx.case.update({ where: { id: decision.caseId }, data: { status: 'appealed' } });
    await enqueue(tx, {
      type: 'appeal_brief',
      payload: { appealId: appeal.id },
      dedupeKey: appealBriefDedupeKey(appeal.id),
    });
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'appeal.created',
      entityType: 'appeal',
      entityId: appeal.id,
      before: { caseStatus: decision.case.status },
      after: {
        caseId: decision.caseId,
        decisionId: decision.id,
        caseStatus: 'appealed',
        statementLength: input.statement.length,
        evidenceLinks: input.evidenceLinks.length,
        hasNote: input.evidenceNote !== null,
      },
      policyVersion: decision.policyVersion,
      requestId,
    });
    // The routing is automatic, so it is recorded as a system action.
    await append(tx, {
      actorId: null,
      actorType: 'system',
      action: 'appeal.assigned',
      entityType: 'appeal',
      entityId: appeal.id,
      after: reviewerId
        ? { assignedReviewerId: reviewerId, rule: 'least_loaded_senior_not_decider' }
        : { assignedReviewerId: null, reason: 'no_eligible_senior' },
      policyVersion: decision.policyVersion,
      requestId,
    });
    return {
      appealId: appeal.id,
      status: appeal.status,
      assigned: reviewerId !== null,
      deadline: deadline.toISOString(),
      caseId: decision.caseId,
    };
  });

  const log = getLogger();
  log.info({
    event: 'appeal.created',
    requestId,
    userId: actor.id,
    appealId: created.appealId,
    decisionId,
    caseId: created.caseId,
    assigned: created.assigned,
  });
  if (!created.assigned) {
    log.warn({ event: 'appeal.unassigned', requestId, appealId: created.appealId, reason: 'no_eligible_senior' });
  }
  return { appealId: created.appealId, status: created.status, assigned: created.assigned, deadline: created.deadline };
}

// --- List (03 sec. 6.7) ---

export const appealListQuerySchema = z.object({
  status: z.enum(['pending', 'resolved']).default('pending'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type AppealListQuery = z.infer<typeof appealListQuerySchema>;

export interface AppealRow {
  id: string;
  status: AppealStatus;
  outcome: AppealOutcome | null;
  createdAt: string;
  resolvedAt: string | null;
  assignedToMe: boolean;
  assignedReviewer: { id: string; name: string } | null;
  /** The viewer made the original decision, so they may read but never resolve it (APP-3). */
  ownDecision: boolean;
  content: { id: string; type: ContentType; excerpt: string; authorName: string };
  decision: { finalAction: ModAction; clauseCodes: string[]; deciderName: string };
}

export interface AppealListPage {
  items: AppealRow[];
  total: number;
  /** Pending appeals with no reviewer: no eligible senior existed when they arrived (APP-3 warning). */
  unassigned: number;
}

export async function listAppeals(actor: Actor, query: AppealListQuery): Promise<AppealListPage> {
  const db = getDb();
  const where = { status: query.status };
  const [rows, total, unassigned] = await Promise.all([
    db.appeal.findMany({
      where,
      orderBy: query.status === 'pending' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ resolvedAt: 'desc' }],
      take: query.limit,
      select: {
        id: true,
        status: true,
        outcome: true,
        createdAt: true,
        resolvedAt: true,
        assignedReviewer: { select: { id: true, name: true } },
        decision: {
          select: { finalAction: true, clauseCodes: true, deciderId: true, decider: { select: { name: true } } },
        },
        case: {
          select: { content: { select: { id: true, type: true, body: true, author: { select: { name: true } } } } },
        },
      },
    }),
    db.appeal.count({ where }),
    db.appeal.count({ where: { status: 'pending', assignedReviewerId: null } }),
  ]);
  const items: AppealRow[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    assignedToMe: row.assignedReviewer?.id === actor.id,
    assignedReviewer: row.assignedReviewer,
    ownDecision: row.decision.deciderId === actor.id,
    content: {
      id: row.case.content.id,
      type: row.case.content.type,
      excerpt: row.case.content.body.slice(0, EXCERPT_CHARS),
      authorName: row.case.content.author.name,
    },
    decision: {
      finalAction: row.decision.finalAction,
      clauseCodes: row.decision.clauseCodes,
      deciderName: row.decision.decider.name,
    },
  }));
  // 03 sec. 6.7: "Assigned to you" first, then by waiting age (the query order). The sort is stable.
  if (query.status === 'pending') items.sort((a, b) => Number(b.assignedToMe) - Number(a.assignedToMe));
  return { items, total, unassigned };
}

// --- Detail (APP-4) ---

export type AppealBriefView =
  | { state: 'pending' }
  | { state: 'unavailable'; reason: string }
  | {
      state: 'ready';
      summary: string;
      newPoints: string[];
      disputedFindings: Array<{ clauseCode: string; authorClaim: string }>;
      droppedClauses: string[];
      /** The summary or a new point reads like a recommendation (AI-12); the page warns the reviewer. */
      outcomeLanguage: boolean;
      model: string | null;
      costUsd: number | null;
    };

export interface AppealDetail {
  id: string;
  status: AppealStatus;
  createdAt: string;
  caseId: string;
  caseStatus: CaseStatus;
  content: {
    id: string;
    type: ContentType;
    body: string;
    createdAt: string;
    visibility: Visibility;
    author: { id: string; name: string };
  };
  original: {
    decisionId: string;
    kind: 'approve' | 'reject' | 'modify';
    finalAction: ModAction;
    recommendedAction: ModAction;
    clauseCodes: string[];
    reasonCategory: string | null;
    rationale: string | null;
    decider: { id: string; name: string };
    policyVersion: number;
    analysisSeq: number;
    createdAt: string;
    /** Rule and AI findings of the analysis the decision was made on; the page highlights their quotes. */
    findings: FindingView[];
  };
  evidence: { statement: string; links: string[]; note: string | null };
  brief: AppealBriefView;
  outcome: {
    outcome: AppealOutcome;
    finalAction: ModAction;
    rationale: string;
    resolver: { id: string; name: string };
    resolvedAt: string;
  } | null;
  assignedReviewer: { id: string; name: string } | null;
  /** From the database (AI-12): the active policy is not the one the decision used. */
  policyChangedSinceDecision: boolean;
  activePolicyVersion: number | null;
  /** A newer analysis written while the case was appealed (02 sec. 6), shown to the reviewer for context. */
  newerAnalysis: {
    seq: number;
    policyVersion: number;
    reason: string;
    action: ModAction;
    clauseCodes: string[];
  } | null;
  /** Clauses of the decision's policy version, for titles and the modify choices. */
  clauses: ClauseView[];
  permissions: { canResolve: boolean; isOriginalDecider: boolean; readOnly: boolean };
}

export async function getAppeal(actor: Actor, appealId: string): Promise<AppealDetail> {
  const db = getDb();
  const row = await db.appeal.findUnique({
    where: { id: appealId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      statement: true,
      evidenceLinks: true,
      evidenceNote: true,
      brief: true,
      briefAiRunId: true,
      outcome: true,
      finalAction: true,
      rationale: true,
      resolvedAt: true,
      resolver: { select: { id: true, name: true } },
      assignedReviewer: { select: { id: true, name: true } },
      briefAiRun: { select: { model: true, costUsd: true } },
      case: {
        select: {
          id: true,
          status: true,
          currentAnalysisId: true,
          content: {
            select: {
              id: true,
              type: true,
              body: true,
              createdAt: true,
              visibility: true,
              author: { select: { id: true, name: true } },
            },
          },
        },
      },
      decision: {
        select: {
          id: true,
          kind: true,
          finalAction: true,
          recommendedAction: true,
          clauseCodes: true,
          reasonCategory: true,
          rationale: true,
          policyVersion: true,
          createdAt: true,
          analysisId: true,
          decider: { select: { id: true, name: true } },
          analysis: { select: { seq: true, ruleFindings: true, aiFindings: true } },
        },
      },
    },
  });
  if (!row) throw new AppError('NOT_FOUND', 'This appeal does not exist.');

  const { decision } = row;
  const [active, policy, newer] = await Promise.all([
    getActivePolicy(db),
    db.policy.findUnique({ where: { version: decision.policyVersion }, select: { clauses: true } }),
    row.case.currentAnalysisId && row.case.currentAnalysisId !== decision.analysisId
      ? db.analysis.findUnique({
          where: { id: row.case.currentAnalysisId },
          select: { seq: true, policyVersion: true, reason: true, recommendation: true },
        })
      : Promise.resolve(null),
  ]);

  const stored = parseStoredBrief(row.brief);
  const brief: AppealBriefView =
    row.briefAiRunId === null || stored === null
      ? { state: 'pending' }
      : stored.aiStatus !== 'ok' || stored.summary === null
        ? { state: 'unavailable', reason: stored.unavailableReason ?? 'AI summary unavailable' }
        : {
            state: 'ready',
            summary: stored.summary,
            newPoints: stored.newPoints,
            disputedFindings: stored.disputedFindings,
            droppedClauses: stored.droppedClauses,
            outcomeLanguage: stored.flags.outcomeLanguage,
            model: row.briefAiRun?.model ?? null,
            costUsd: row.briefAiRun ? Number(row.briefAiRun.costUsd) : null,
          };

  const isOriginalDecider = decision.decider.id === actor.id;
  const newerRec = newer ? parseRecommendation(newer.recommendation) : null;

  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    caseId: row.case.id,
    caseStatus: row.case.status,
    content: {
      id: row.case.content.id,
      type: row.case.content.type,
      body: row.case.content.body,
      createdAt: row.case.content.createdAt.toISOString(),
      visibility: row.case.content.visibility,
      author: row.case.content.author,
    },
    original: {
      decisionId: decision.id,
      kind: decision.kind,
      finalAction: decision.finalAction,
      recommendedAction: decision.recommendedAction,
      clauseCodes: decision.clauseCodes,
      reasonCategory: decision.reasonCategory,
      rationale: decision.rationale,
      decider: decision.decider,
      policyVersion: decision.policyVersion,
      analysisSeq: decision.analysis.seq,
      createdAt: decision.createdAt.toISOString(),
      findings: [
        ...parseRuleFindings(decision.analysis.ruleFindings),
        ...(parseAiDetail(decision.analysis.aiFindings)?.findings ?? []),
      ],
    },
    evidence: { statement: row.statement, links: row.evidenceLinks, note: row.evidenceNote },
    brief,
    outcome:
      row.status === 'resolved' && row.outcome && row.finalAction && row.rationale && row.resolver && row.resolvedAt
        ? {
            outcome: row.outcome,
            finalAction: row.finalAction,
            rationale: row.rationale,
            resolver: row.resolver,
            resolvedAt: row.resolvedAt.toISOString(),
          }
        : null,
    assignedReviewer: row.assignedReviewer,
    policyChangedSinceDecision: active !== null && active.version !== decision.policyVersion,
    activePolicyVersion: active?.version ?? null,
    newerAnalysis:
      newer && newerRec
        ? {
            seq: newer.seq,
            policyVersion: newer.policyVersion,
            reason: newer.reason,
            action: newerRec.action,
            clauseCodes: newerRec.clauseCodes,
          }
        : null,
    clauses: clausesSchema.parse(policy?.clauses ?? []).map((c) => ({
      code: c.code,
      title: c.title,
      text: c.text,
      defaultSeverity: c.defaultSeverity,
      defaultAction: c.defaultAction,
      allowedActions: [...c.allowedActions],
    })),
    permissions: {
      canResolve: actor.role === 'senior_moderator' && !isOriginalDecider && row.status === 'pending',
      isOriginalDecider,
      readOnly: actor.role !== 'senior_moderator',
    },
  };
}

// --- Resolve (APP-3, APP-5) ---

export interface ResolvedAppeal {
  appealId: string;
  outcome: AppealOutcome;
  originalAction: ModAction;
  finalAction: ModAction;
  visibility: Visibility;
}

const RESOLVER_ROLE: Role = 'senior_moderator';

export async function resolveAppeal(
  actor: Actor,
  appealId: string,
  input: ResolveInput,
  requestId: string,
): Promise<ResolvedAppeal> {
  // The route already allows only senior moderators; this keeps the service safe for any other caller.
  if (actor.role !== RESOLVER_ROLE) throw new AppError('FORBIDDEN', "You don't have access to this.");
  const db = getDb();
  const located = await db.appeal.findUnique({ where: { id: appealId }, select: { caseId: true } });
  if (!located) throw new AppError('NOT_FOUND', 'This appeal does not exist.');

  const result = await db.$transaction(async (tx) => {
    await lockCase(tx, located.caseId);
    const appeal = await tx.appeal.findUniqueOrThrow({
      where: { id: appealId },
      select: {
        id: true,
        status: true,
        assignedReviewerId: true,
        case: { select: { id: true, status: true, contentId: true } },
        decision: { select: { id: true, deciderId: true, finalAction: true, clauseCodes: true, policyVersion: true } },
      },
    });
    const { decision } = appeal;

    // APP-3: a second review means a different person, whatever state the appeal is in.
    if (decision.deciderId === actor.id) {
      getLogger().warn({ event: 'access.denied', requestId, userId: actor.id, appealId, reason: 'same_reviewer' });
      throw new AppError(
        'SAME_REVIEWER',
        'Only a different senior moderator can review an appeal of your own decision.',
      );
    }
    if (appeal.status !== 'pending') throw new AppError('ALREADY_DECIDED', 'This appeal has already been resolved.');
    if (appeal.case.status !== 'appealed') {
      throw new AppError('INVALID_TRANSITION', 'This case is not waiting for an appeal review.');
    }

    let finalAction: ModAction;
    if (input.outcome === 'uphold') finalAction = decision.finalAction;
    else if (input.outcome === 'overturn') finalAction = 'none';
    else {
      if (input.finalAction === 'none') {
        throw new AppError('VALIDATION_FAILED', 'Some fields are not valid.', [
          { path: 'finalAction', message: 'To remove the action, choose Overturn.' },
        ]);
      }
      if (input.finalAction === decision.finalAction) {
        throw new AppError('VALIDATION_FAILED', 'Some fields are not valid.', [
          { path: 'finalAction', message: 'Choose a different action, or Uphold the decision.' },
        ]);
      }
      const policy = await tx.policy.findUnique({
        where: { version: decision.policyVersion },
        select: { clauses: true },
      });
      const clauses = clausesSchema.parse(policy?.clauses ?? []).filter((c) => decision.clauseCodes.includes(c.code));
      const allowed = clauses.some((c) => (c.allowedActions as readonly ModAction[]).includes(input.finalAction));
      if (!allowed) {
        throw new AppError(
          'ACTION_NOT_ALLOWED',
          `"${input.finalAction}" is not allowed by ${decision.clauseCodes.join(', ') || 'the decision clauses'}. ` +
            'Choose an action one of the clauses allows.',
        );
      }
      finalAction = input.finalAction;
    }

    // The outcome is applied through the one visibility writer (HUM-1); its own audit event names the appeal.
    const visibility = await setVisibility(tx, {
      contentId: appeal.case.contentId,
      visibility: ACTION_VISIBILITY[finalAction],
      actor,
      caseId: appeal.case.id,
      decisionId: decision.id,
      appealId,
      policyVersion: decision.policyVersion,
      requestId,
    });
    await tx.appeal.update({
      where: { id: appealId },
      data: {
        status: 'resolved',
        outcome: input.outcome,
        finalAction,
        resolverId: actor.id,
        rationale: input.rationale,
        resolvedAt: new Date(),
      },
    });
    await tx.case.update({ where: { id: appeal.case.id }, data: { status: 'appeal_resolved' } });
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'appeal.resolved',
      entityType: 'appeal',
      entityId: appealId,
      before: { status: 'pending', caseStatus: appeal.case.status },
      after: {
        status: 'resolved',
        caseId: appeal.case.id,
        caseStatus: 'appeal_resolved',
        decisionId: decision.id,
        outcome: input.outcome,
        originalAction: decision.finalAction,
        finalAction,
        byAssignedReviewer: appeal.assignedReviewerId === actor.id,
      },
      policyVersion: decision.policyVersion,
      requestId,
    });
    return {
      appealId,
      outcome: input.outcome,
      originalAction: decision.finalAction,
      finalAction,
      visibility: visibility.after,
    };
  });

  getLogger().info({
    event: 'appeal.resolved',
    requestId,
    userId: actor.id,
    appealId,
    outcome: result.outcome,
    originalAction: result.originalAction,
    finalAction: result.finalAction,
  });
  return result;
}
