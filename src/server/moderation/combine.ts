import { higherSeverity, strongerAction, type ActivePolicy, type ModAction, type Severity } from '../policy/schema';
import type { RuleFinding } from '../rules';
import { computePriority } from './priority';

// Rule findings (+ AI result, from S3) -> recommendation (docs/02-system-design.md sec. 5.6). The server, not
// the model, decides needsHuman (AI-6). Until S3 the AI is always reported unavailable, which by AI-6 means
// every analysis needs a human and nothing is auto-cleared.

/**
 * The AI side of the analysis. S2 only has the unavailable state; S3 adds the verified AI result
 * (findings, action, confidence) as a second member of this union and extends combine() for it.
 */
export type AiOutcome = { status: 'unavailable'; reason: string };

export interface CombineInput {
  policy: ActivePolicy;
  ruleFindings: RuleFinding[];
  reportCount: number;
  ai: AiOutcome;
}

export interface Recommendation {
  action: ModAction;
  severity: Severity | null;
  /** AI overall confidence after caps; null when the AI is unavailable. */
  confidence: number | null;
  needsHuman: boolean;
  /** Plain-language reasons a human must decide, in AI-6 order. */
  reasons: string[];
  autoClear: boolean;
  clauseCodes: string[];
  alwaysEscalate: boolean;
  priority: number;
}

export const RULE_ONLY_REASON = 'rule findings only';

export function combine({ policy, ruleFindings, reportCount, ai }: CombineInput): Recommendation {
  const clauses = new Map(policy.clauses.map((clause) => [clause.code, clause]));
  const hitCodes = [...new Set(ruleFindings.map((f) => f.clauseCode))].filter((code) => clauses.has(code));

  let action: ModAction = 'none';
  let severity: Severity | null = null;
  for (const code of hitCodes) {
    const clause = clauses.get(code);
    if (!clause) continue;
    action = strongerAction(action, clause.defaultAction);
    severity = higherSeverity(severity, clause.defaultSeverity);
  }
  for (const f of ruleFindings) severity = higherSeverity(severity, f.severity);

  const escalating = hitCodes.filter((code) => clauses.get(code)?.alwaysEscalate);
  const highCodes = [...new Set(ruleFindings.filter((f) => f.severity === 'high').map((f) => f.clauseCode))];

  const reasons: string[] = [];
  if (ai.status === 'unavailable') reasons.push(`AI review unavailable - ${ai.reason}.`);
  if (action !== 'none') reasons.push(`The suggested action is "${action}", not "none".`);
  if (highCodes.length > 0) reasons.push(`High-severity finding (${highCodes.join(', ')}).`);
  if (escalating.length > 0) reasons.push(`${escalating.join(', ')} always needs a human decision.`);
  if (reportCount > 0) reasons.push(`Reported by ${reportCount} ${reportCount === 1 ? 'user' : 'users'}.`);

  const needsHuman = reasons.length > 0;
  return {
    action,
    severity,
    confidence: null,
    needsHuman,
    reasons,
    // AI-7: auto-clear needs a successful AI run, so it is impossible until S3.
    autoClear: false,
    clauseCodes: hitCodes,
    alwaysEscalate: escalating.length > 0,
    priority: computePriority({ severity, reportCount, needsHuman, alwaysEscalate: escalating.length > 0 }),
  };
}
