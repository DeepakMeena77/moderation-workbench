import type { ModerationSettings } from '../ai/aiConfig';
import {
  actionRank,
  maxSeverity,
  strongerAction,
  type AiStatus,
  type ModAction,
  type PolicyClauseView,
  type PolicyView,
  type Severity,
} from '../ai/types';
import type { VerificationReport, VerifiedOutput } from '../ai/verify';
import type { RuleFinding } from '../rules';
import { computePriority } from './priority';

// Combine (docs/02-system-design.md sec. 5.6; AI-6, AI-7, AI-8, DET-5, Q-2). The server, not the model, decides
// whether a human is needed. The result is a recommendation only: nothing here changes visibility or a case.

/** Deterministic rule hits (docs/02-system-design.md sec. 5.1) come from src/server/rules. */
export type { RuleFinding };

/** The part of a classify result that combine reads. */
export interface AiOutcome {
  status: AiStatus;
  output: VerifiedOutput | null;
  verification: VerificationReport | null;
  injectionSignals: readonly string[];
  unavailableReason: string | null;
}

export interface CombineInput {
  policy: PolicyView;
  ruleFindings: readonly RuleFinding[];
  ai: AiOutcome;
  reportCount: number;
  settings: ModerationSettings;
}

export interface Recommendation {
  action: ModAction;
  severity: Severity | null;
  /** AI overall confidence after verification caps; null when the AI result is missing. */
  confidence: number | null;
  needsHuman: boolean;
  /** Plain language; reasons that come from the model start with "AI:". */
  reasons: string[];
  autoClear: boolean;
  priority: number;
  /** Clauses cited by the rules or the verified AI findings, sorted. */
  clauseCodes: string[];
  /** A cited clause always goes to a human. Stored so a later report can keep priority at 100 (Q-2). */
  alwaysEscalate: boolean;
}

function strongestAllowed(clauses: readonly PolicyClauseView[]): ModAction {
  let best: ModAction = 'none';
  for (const clause of clauses) for (const action of clause.allowedActions) best = strongerAction(best, action);
  return best;
}

export function combine(input: CombineInput): Recommendation {
  const { policy, ai, settings } = input;
  const clauseByCode = new Map(policy.clauses.map((c) => [c.code, c]));
  // Rules are built from the same policy; a stale code is ignored rather than trusted.
  const ruleFindings = input.ruleFindings.filter((f) => clauseByCode.has(f.clauseCode));
  const aiOk = ai.status === 'ok' && ai.output !== null;
  const aiFindings = aiOk ? (ai.output?.findings ?? []) : [];

  const codes = [...new Set([...ruleFindings.map((f) => f.clauseCode), ...aiFindings.map((f) => f.clauseCode)])].sort();
  const clauses = codes.map((code) => clauseByCode.get(code)).filter((c): c is PolicyClauseView => c !== undefined);

  // Action: the stronger of the (already lowered) AI action and each rule-hit clause's default, never above allowed.
  let action: ModAction = aiOk && ai.output ? ai.output.proposedAction : 'none';
  for (const f of ruleFindings)
    action = strongerAction(action, clauseByCode.get(f.clauseCode)?.defaultAction ?? 'none');
  const cap = strongestAllowed(clauses);
  if (actionRank(action) > actionRank(cap)) action = cap;

  const severity = maxSeverity([...ruleFindings.map((f) => f.severity), ...aiFindings.map((f) => f.severity)]);
  const confidence = aiOk && ai.output ? ai.output.overallConfidence : null;
  const alwaysEscalate = clauses.filter((c) => c.alwaysEscalate);

  // AI-6 (and AI-8): every reason a human must look, in plain language.
  const reasons: string[] = [];
  if (!aiOk)
    reasons.push(`AI result missing: ${ai.unavailableReason ?? 'AI unavailable - retry later'}. Rule findings only.`);
  if (action !== 'none') reasons.push(`The recommended action is "${action}"; any action needs a human decision.`);
  if (aiOk && ai.output) {
    if (ai.output.needsHumanReview) {
      const asked = ai.output.humanReviewReasons;
      if (asked.length === 0) reasons.push('AI: asked for human review.');
      for (const r of asked) reasons.push(`AI: ${r}`);
    }
    if (ai.output.overallConfidence < settings.humanConfidenceThreshold) {
      reasons.push(
        `AI confidence ${ai.output.overallConfidence.toFixed(2)} is below ${settings.humanConfidenceThreshold.toFixed(2)}.`,
      );
    }
    if (ai.output.insufficientContext) reasons.push('AI: not enough context to judge this content.');
  }
  const highCodes = [
    ...new Set([...ruleFindings, ...aiFindings].filter((f) => f.severity === 'high').map((f) => f.clauseCode)),
  ].sort();
  if (highCodes.length > 0) reasons.push(`High severity finding (${highCodes.join(', ')}).`);
  for (const c of alwaysEscalate) reasons.push(`Clause ${c.code} always goes to a human.`);
  if (aiOk) {
    // DET-5: only "rules found X and the AI succeeded without citing X" counts as disagreement.
    const aiCodes = new Set(aiFindings.map((f) => f.clauseCode));
    const missed = [...new Set(ruleFindings.map((f) => f.clauseCode))].filter((code) => !aiCodes.has(code)).sort();
    if (missed.length > 0) reasons.push(`Rules and AI disagree: rules found ${missed.join(', ')}, the AI did not.`);
  }
  const invalid = ai.verification?.invalidCitations ?? [];
  if (invalid.length > 0)
    reasons.push(
      `AI cited clauses that are not in policy v${policy.version}: ${[...new Set(invalid)].join(', ')} (removed).`,
    );
  const unverified = ai.verification?.unverifiedQuotes ?? [];
  if (unverified.length > 0) {
    reasons.push(
      `AI quotes not found in the content (${[...new Set(unverified)].join(', ')}); treated as interpretation.`,
    );
  }
  if (input.reportCount > 0)
    reasons.push(`Reported by ${input.reportCount} ${input.reportCount === 1 ? 'user' : 'users'}.`);
  if (ai.injectionSignals.length > 0) {
    reasons.push('The content contains instructions aimed at the AI; they were treated as content.');
  }

  const needsHuman = reasons.length > 0;
  // AI-7: auto-clear only on a clean, confident AI result with nothing else pointing at a human.
  const autoClear =
    settings.autoClearEnabled &&
    aiOk &&
    ruleFindings.length === 0 &&
    aiFindings.length === 0 &&
    input.reportCount === 0 &&
    confidence !== null &&
    confidence >= settings.autoClearMinConfidence &&
    !needsHuman;

  return {
    action,
    severity,
    confidence,
    needsHuman,
    reasons,
    autoClear,
    priority: computePriority({
      severity,
      reportCount: input.reportCount,
      needsHuman,
      alwaysEscalate: alwaysEscalate.length > 0,
    }),
    clauseCodes: codes,
    alwaysEscalate: alwaysEscalate.length > 0,
  };
}
