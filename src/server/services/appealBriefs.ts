import type { AiStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AppealBrief, AppealBriefInput, AppealBriefResult, BriefFinding } from '../ai/appealBrief';
import { getDb } from '../db';
import { getLogger } from '../logger';
import { clausesSchema } from '../policy/schema';
import { append } from './audit';
import { parseAiDetail, parseRuleFindings } from './cases';

// The appeal_brief job's reads and its one write (docs/02-system-design.md sec. 5.7 and sec. 11, AI-12). This file
// writes only Appeal.brief and Appeal.briefAiRunId, plus the audit event: it never resolves an appeal and never
// touches visibility, which is why src/server/jobs may call it while services/appeals.ts stays out of its reach.

export const appealBriefPayloadSchema = z.object({ appealId: z.string().min(1) });

/** What is stored in Appeal.brief. A failed run still stores its status, so the page can say why there is none. */
export interface StoredBrief {
  aiStatus: AiStatus;
  unavailableReason: string | null;
  summary: string | null;
  newPoints: string[];
  disputedFindings: AppealBrief['disputedFindings'];
  droppedClauses: string[];
}

const AI_STATUSES = [
  'ok',
  'timeout',
  'rate_limited',
  'invalid_output',
  'invalid_input',
  'provider_error',
  'budget_exhausted',
  'unavailable',
] as const satisfies readonly AiStatus[];

// Lenient read of the stored JSON, field by field, like the analysis JSON on the case page.
const storedBriefSchema = z.object({
  aiStatus: z.enum(AI_STATUSES).catch('unavailable'),
  unavailableReason: z.string().nullable().catch(null),
  summary: z.string().nullable().catch(null),
  newPoints: z.array(z.string()).catch([]),
  disputedFindings: z.array(z.object({ clauseCode: z.string(), authorClaim: z.string() })).catch([]),
  droppedClauses: z.array(z.string()).catch([]),
});

export function parseStoredBrief(value: unknown): StoredBrief | null {
  if (typeof value !== 'object' || value === null) return null;
  return storedBriefSchema.parse(value);
}

export type PreparedBrief = { appealId: string; input: AppealBriefInput } | { skipped: 'already_written' };

/** Step 1 of the job: everything the brief is built from, read without a lock. */
export async function prepareAppealBrief(appealId: string): Promise<PreparedBrief> {
  const db = getDb();
  const appeal = await db.appeal.findUnique({
    where: { id: appealId },
    select: {
      id: true,
      statement: true,
      evidenceLinks: true,
      evidenceNote: true,
      briefAiRunId: true,
      case: { select: { content: { select: { type: true, body: true } } } },
      decision: {
        select: {
          kind: true,
          finalAction: true,
          clauseCodes: true,
          reasonCategory: true,
          rationale: true,
          policyVersion: true,
          analysis: { select: { ruleFindings: true, aiFindings: true } },
        },
      },
    },
  });
  // A missing appeal is an infrastructure fault (the job was enqueued with it), so the job retries and then fails.
  if (!appeal) throw new Error(`Appeal ${appealId} does not exist.`);
  if (appeal.briefAiRunId !== null) return { skipped: 'already_written' };

  const { decision } = appeal;
  const policy = await db.policy.findUnique({
    where: { version: decision.policyVersion },
    select: { version: true, clauses: true },
  });
  if (!policy) throw new Error(`Policy v${decision.policyVersion} of the decision does not exist.`);

  const findings: BriefFinding[] = [
    ...parseRuleFindings(decision.analysis.ruleFindings),
    ...(parseAiDetail(decision.analysis.aiFindings)?.findings ?? []),
  ].map((f) => ({
    clauseCode: f.clauseCode,
    source: f.source,
    evidenceType: f.evidenceType,
    quotes: f.quotes.map((q) => q.text),
    interpretation: f.interpretation,
  }));

  return {
    appealId: appeal.id,
    input: {
      policy: { version: policy.version, clauses: clausesSchema.parse(policy.clauses) },
      content: { type: appeal.case.content.type, text: appeal.case.content.body },
      findings,
      decision: {
        kind: decision.kind,
        finalAction: decision.finalAction,
        clauseCodes: decision.clauseCodes,
        reasonCategory: decision.reasonCategory,
        rationale: decision.rationale,
      },
      appeal: {
        statement: appeal.statement,
        evidenceLinks: appeal.evidenceLinks,
        evidenceNote: appeal.evidenceNote,
      },
    },
  };
}

/**
 * Step 3 of the job (the AI call ran outside any transaction and wrote its own AiRun): store the brief and its
 * audit event in one transaction (AUD-1). Written once: a retried job that finds a brief already stored writes
 * nothing. The brief may land after the appeal was resolved; it is still kept for the record.
 */
export async function recordAppealBrief(
  appealId: string,
  result: AppealBriefResult,
  requestId: string | null,
): Promise<{ written: boolean }> {
  const stored: StoredBrief = {
    aiStatus: result.status,
    unavailableReason: result.unavailableReason,
    summary: result.brief?.summary ?? null,
    newPoints: result.brief?.newPoints ?? [],
    disputedFindings: result.brief?.disputedFindings ?? [],
    droppedClauses: result.droppedClauses,
  };
  const written = await getDb().$transaction(async (tx) => {
    const updated = await tx.appeal.updateMany({
      where: { id: appealId, briefAiRunId: null },
      data: { brief: stored as unknown as Prisma.InputJsonObject, briefAiRunId: result.aiRunId },
    });
    if (updated.count === 0) return false;
    await append(tx, {
      actorId: null,
      actorType: 'ai',
      action: 'appeal.brief_created',
      entityType: 'appeal',
      entityId: appealId,
      after: {
        aiStatus: result.status,
        aiRunId: result.aiRunId,
        newPoints: stored.newPoints.length,
        disputedFindings: stored.disputedFindings.length,
        droppedClauses: stored.droppedClauses.length,
      },
      policyVersion: result.aiRun.policyVersion,
      requestId,
    });
    return true;
  });
  getLogger().info({
    event: written ? 'appeal.brief_created' : 'appeal.brief_skipped',
    requestId,
    appealId,
    aiRunId: result.aiRunId,
    aiStatus: result.status,
  });
  return { written };
}
