import type { Clause, DecisionRequest, DecisionResult, ModAction } from '../../api/hooks';

// The decision form's rules (HUM-2..4), mirrored from src/server/services/decisions.ts so the moderator sees
// the problem before submitting. The server checks everything again; these are pure functions for tests.

export const MIN_RATIONALE_CHARS = 10;
export const MAX_RATIONALE_CHARS = 2000;

export const REJECT_REASONS = [
  { value: 'false_positive', label: 'False positive' },
  { value: 'missing_context', label: 'Missing context' },
  { value: 'wrong_clause', label: 'Wrong clause' },
  { value: 'other', label: 'Other' },
] as const;

export const MODIFY_REASONS = [
  { value: 'wrong_clause', label: 'Wrong clause' },
  { value: 'severity_too_high', label: 'Severity too high' },
  { value: 'severity_too_low', label: 'Severity too low' },
  { value: 'policy_gap', label: 'Policy gap' },
  { value: 'missing_context', label: 'Missing context' },
  { value: 'other', label: 'Other' },
] as const;

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  [...REJECT_REASONS, ...MODIFY_REASONS].map((r) => [r.value, r.label]),
);

/** Actions a moderator can choose in Modify: every clause action; "none" is a Reject. */
export const MODIFY_ACTIONS: readonly ModAction[] = ['label', 'limit', 'remove'];

export type DecisionMode = 'reject' | 'modify';

/** The three decisions as option cards, each with its consequence (03 sec. 6.6). */
export type DecisionChoice = 'approve' | 'reject' | 'modify';

export const DECISION_OPTIONS: ReadonlyArray<{ value: DecisionChoice; title: string; description: string }> = [
  { value: 'approve', title: 'Approve', description: 'Take the recommended action' },
  { value: 'reject', title: 'Reject', description: 'No violation; keep it visible' },
  { value: 'modify', title: 'Modify', description: 'Choose a different action or clause' },
];

const ACTION_VERB: Record<ModAction, string> = {
  none: 'take no action on',
  label: 'label',
  limit: 'limit',
  remove: 'remove',
};

/**
 * The submit button says exactly what will happen: "Approve: limit this post", "Reject: keep visible",
 * "Modify: label under HAR-1". Before a choice it asks for one.
 */
export function decisionButtonLabel(
  choice: DecisionChoice | null,
  context: {
    recommended: ModAction;
    contentType: 'post' | 'comment';
    finalAction: ModAction | null;
    clauseCodes: readonly string[];
  },
): string {
  if (choice === 'approve') return `Approve: ${ACTION_VERB[context.recommended]} this ${context.contentType}`;
  if (choice === 'reject') return 'Reject: keep visible';
  if (choice === 'modify') {
    if (!context.finalAction) return 'Modify: choose an action';
    const under = context.clauseCodes.length > 0 ? ` under ${context.clauseCodes.join(', ')}` : '';
    return `Modify: ${context.finalAction}${under}`;
  }
  return 'Choose a decision';
}

export const CHOICE_ERROR = 'Choose approve, reject or modify.';

export interface DecisionDraft {
  mode: DecisionMode;
  finalAction: ModAction | null;
  clauseCodes: string[];
  reasonCategory: string | null;
  rationale: string;
}

export type DraftField = 'finalAction' | 'clauseCodes' | 'reasonCategory' | 'rationale';
export type DraftErrors = Partial<Record<DraftField, string>>;

/** Field order, so focus can move to the first invalid one (03 sec. 8). */
export const FIELD_ORDER: readonly DraftField[] = ['clauseCodes', 'finalAction', 'reasonCategory', 'rationale'];

export function allowedActions(clauses: readonly Clause[], codes: readonly string[]): Set<ModAction> {
  const chosen = new Set(codes);
  return new Set(clauses.filter((c) => chosen.has(c.code)).flatMap((c) => c.allowedActions));
}

/** Why an action chip is disabled in Modify, or null when it can be chosen. */
export function actionDisabledReason(
  action: ModAction,
  clauses: readonly Clause[],
  codes: readonly string[],
): string | null {
  if (codes.length === 0) return 'Choose a clause first.';
  return allowedActions(clauses, codes).has(action) ? null : `None of ${codes.join(', ')} allows ${action}.`;
}

export function validateDraft(draft: DecisionDraft, clauses: readonly Clause[]): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.mode === 'modify') {
    if (draft.clauseCodes.length === 0) errors.clauseCodes = 'Choose at least one clause.';
    if (!draft.finalAction) errors.finalAction = 'Choose an action.';
    else if (draft.clauseCodes.length > 0 && !allowedActions(clauses, draft.clauseCodes).has(draft.finalAction)) {
      errors.finalAction = `None of the chosen clauses allows ${draft.finalAction}.`;
    }
  }
  if (!draft.reasonCategory) errors.reasonCategory = 'Choose a reason.';
  const rationale = draft.rationale.trim();
  if (rationale.length < MIN_RATIONALE_CHARS) errors.rationale = 'Explain your change in at least 10 characters.';
  else if (rationale.length > MAX_RATIONALE_CHARS) errors.rationale = 'Keep it under 2,000 characters.';
  return errors;
}

export function toRequest(draft: DecisionDraft, analysisId: string): DecisionRequest {
  const rationale = draft.rationale.trim();
  const reasonCategory = draft.reasonCategory ?? '';
  if (draft.mode === 'reject') return { kind: 'reject', analysisId, reasonCategory, rationale };
  return {
    kind: 'modify',
    analysisId,
    finalAction: draft.finalAction ?? 'label',
    clauseCodes: draft.clauseCodes,
    reasonCategory,
    rationale,
  };
}

const OUTCOME: Record<ModAction, string> = {
  none: 'no action, the content stays visible',
  label: 'content labelled',
  limit: 'content limited',
  remove: 'content removed',
};

/** "Decision saved - content labelled under HAR-1." (03 sec. 7) */
export function successMessage(result: Pick<DecisionResult, 'finalAction' | 'clauseCodes'>): string {
  const under =
    result.finalAction !== 'none' && result.clauseCodes.length > 0 ? ` under ${result.clauseCodes.join(', ')}` : '';
  return `Decision saved - ${OUTCOME[result.finalAction]}${under}.`;
}
