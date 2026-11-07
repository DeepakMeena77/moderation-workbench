import type { Visibility } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { getLogger } from '../logger';
import { clausesSchema, MOD_ACTIONS, type ModAction } from '../policy/schema';
import { append } from './audit';
import { parseRecommendation } from './cases';
import { ACTION_VISIBILITY, isHumanDecider, setVisibility } from './visibility';

// A human moderator's decision on a case (HUM-2..7, docs/02-system-design.md sec. 8). Approve, reject and modify
// apply to the recommendation (01 sec. 3): approve applies the recommended action, reject applies none, modify
// applies a moderator-chosen action allowed by the chosen clauses. One transaction: lock the case, check status
// and analysis, insert the (insert-only) Decision, set visibility, resolve the case, audit.

export const REJECT_REASONS = ['false_positive', 'missing_context', 'wrong_clause', 'other'] as const;
export const MODIFY_REASONS = [
  'wrong_clause',
  'severity_too_high',
  'severity_too_low',
  'policy_gap',
  'missing_context',
  'other',
] as const;

export const MIN_RATIONALE_CHARS = 10;
export const MAX_RATIONALE_CHARS = 2000;

// The messages are the UI copy (03 sec. 7).
const rationale = z
  .string({ required_error: 'Explain your change in at least 10 characters.' })
  .trim()
  .min(MIN_RATIONALE_CHARS, 'Explain your change in at least 10 characters.')
  .max(MAX_RATIONALE_CHARS, `Keep it under ${MAX_RATIONALE_CHARS.toLocaleString('en-US')} characters.`);
const analysisId = z.string({ required_error: 'Reload the case and try again.' }).min(1).max(64);

export const decisionInputSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('approve'), analysisId }),
    z.object({
      kind: z.literal('reject'),
      analysisId,
      reasonCategory: z.enum(REJECT_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }),
      rationale,
    }),
    z.object({
      kind: z.literal('modify'),
      analysisId,
      finalAction: z.enum(MOD_ACTIONS, { errorMap: () => ({ message: 'Choose an action.' }) }),
      clauseCodes: z
        .array(z.string().trim().min(1).max(16), { required_error: 'Choose at least one clause.' })
        .min(1, 'Choose at least one clause.')
        .max(10, 'Choose at most 10 clauses.')
        .transform((codes) => [...new Set(codes.map((code) => code.toUpperCase()))]),
      reasonCategory: z.enum(MODIFY_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }),
      rationale,
    }),
  ],
  { errorMap: () => ({ message: 'Choose approve, reject or modify.' }) },
);

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export interface DecisionResult {
  decisionId: string;
  kind: DecisionInput['kind'];
  recommendedAction: ModAction;
  finalAction: ModAction;
  clauseCodes: string[];
  policyVersion: number;
  visibility: Visibility;
}

const ALREADY_DECIDED: Record<string, string> = {
  resolved: 'This case has already been decided.',
  appealed: 'This case has already been decided and is under appeal.',
  appeal_resolved: 'This case has already been decided and its appeal resolved.',
  auto_cleared: 'This case was auto-cleared. Reopen it to decide.',
  pending_analysis: 'This case is being analysed. Reload when the analysis is ready.',
};

export async function decide(
  actor: Actor,
  caseId: string,
  input: DecisionInput,
  requestId: string,
): Promise<DecisionResult> {
  // HUM-7: the route already refuses admins; this keeps the service safe for any other caller.
  if (!isHumanDecider(actor)) throw new AppError('FORBIDDEN', "You don't have access to this.");

  const result = await getDb().$transaction(async (tx) => {
    // 1. Lock the case row: concurrent decisions on one case are serialised, so only the first can win.
    await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR UPDATE`;
    const kase = await tx.case.findUnique({
      where: { id: caseId },
      select: { id: true, status: true, contentId: true, currentAnalysisId: true },
    });
    if (!kase) throw new AppError('NOT_FOUND', 'This case does not exist.');

    // 2. Only a case waiting for review can be decided.
    if (kase.status !== 'awaiting_review') {
      throw new AppError('ALREADY_DECIDED', ALREADY_DECIDED[kase.status] ?? 'This case cannot be decided now.', {
        status: kase.status,
      });
    }

    // 3. The decision must be made on the analysis the moderator saw (HUM-6).
    const current = kase.currentAnalysisId
      ? await tx.analysis.findUnique({
          where: { id: kase.currentAnalysisId },
          select: { id: true, seq: true, policyVersion: true, recommendation: true },
        })
      : null;
    if (!current || current.id !== input.analysisId) {
      throw new AppError(
        'STALE_ANALYSIS',
        current
          ? `This case changed while you were reviewing it (re-analysed under policy v${current.policyVersion}). ` +
              'Reload to decide on the latest analysis.'
          : 'This case changed while you were reviewing it. Reload to decide on the latest analysis.',
        current ? { currentAnalysisId: current.id, seq: current.seq, policyVersion: current.policyVersion } : {},
      );
    }

    // 4. Validate by kind.
    const recommendation = parseRecommendation(current.recommendation);
    const recommendedAction = recommendation.action;
    let finalAction: ModAction;
    let clauseCodes: string[];
    if (input.kind === 'approve') {
      finalAction = recommendedAction;
      clauseCodes = recommendation.clauseCodes;
    } else if (input.kind === 'reject') {
      finalAction = 'none';
      clauseCodes = [];
    } else {
      const policy = await tx.policy.findUnique({
        where: { version: current.policyVersion },
        select: { clauses: true },
      });
      const clauses = new Map(clausesSchema.parse(policy?.clauses ?? []).map((c) => [c.code, c]));
      const unknown = input.clauseCodes.filter((code) => !clauses.has(code));
      if (unknown.length > 0) {
        throw new AppError('VALIDATION_FAILED', 'Some fields are not valid.', [
          {
            path: 'clauseCodes',
            message: `${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in policy v${current.policyVersion}.`,
          },
        ]);
      }
      const allowed = input.clauseCodes.some((code) =>
        (clauses.get(code)?.allowedActions as readonly ModAction[] | undefined)?.includes(input.finalAction),
      );
      if (!allowed) {
        throw new AppError(
          'ACTION_NOT_ALLOWED',
          `"${input.finalAction}" is not allowed by ${input.clauseCodes.join(', ')}. Choose an action one of the clauses allows.`,
        );
      }
      finalAction = input.finalAction;
      clauseCodes = input.clauseCodes;
    }

    // 5. Insert the decision, with the policy version of the analysis it was based on (HUM-5).
    const decision = await tx.decision.create({
      data: {
        caseId,
        analysisId: current.id,
        policyVersion: current.policyVersion,
        deciderId: actor.id,
        kind: input.kind,
        recommendedAction,
        finalAction,
        clauseCodes,
        reasonCategory: input.kind === 'approve' ? null : input.reasonCategory,
        rationale: input.kind === 'approve' ? null : input.rationale,
      },
      select: { id: true },
    });

    // 6. Apply the outcome through the one visibility writer (HUM-1).
    const visibility = await setVisibility(tx, {
      contentId: kase.contentId,
      visibility: ACTION_VISIBILITY[finalAction],
      actor,
      caseId,
      decisionId: decision.id,
      policyVersion: current.policyVersion,
      requestId,
    });

    // 7. Resolve the case.
    await tx.case.update({ where: { id: caseId }, data: { status: 'resolved' } });

    // 8. Audit the decision itself (the visibility change has its own event).
    await append(tx, {
      actorId: actor.id,
      actorType: 'human',
      action: 'decision.created',
      entityType: 'decision',
      entityId: decision.id,
      before: { caseStatus: kase.status },
      after: {
        caseId,
        caseStatus: 'resolved',
        kind: input.kind,
        analysisId: current.id,
        analysisSeq: current.seq,
        recommendedAction,
        finalAction,
        clauseCodes,
        reasonCategory: input.kind === 'approve' ? null : input.reasonCategory,
        hasRationale: input.kind !== 'approve',
      },
      policyVersion: current.policyVersion,
      requestId,
    });

    return {
      decisionId: decision.id,
      kind: input.kind,
      recommendedAction,
      finalAction,
      clauseCodes,
      policyVersion: current.policyVersion,
      visibility: visibility.after,
    };
  });

  getLogger().info({
    event: 'decision.created',
    requestId,
    userId: actor.id,
    caseId,
    decisionId: result.decisionId,
    kind: result.kind,
    recommendedAction: result.recommendedAction,
    finalAction: result.finalAction,
    policyVersion: result.policyVersion,
  });
  return result;
}
