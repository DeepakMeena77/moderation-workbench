import type { AppealOutcome, Clause, ModAction, ResolveRequest, ResolvedAppeal } from '../../api/hooks';

// The resolve form's rules (APP-5), mirrored from src/server/services/appeals.ts so the senior moderator sees a
// problem before submitting. The server checks everything again; these are pure functions for tests.

export const MIN_RATIONALE_CHARS = 10;
export const MAX_RATIONALE_CHARS = 2000;

export const OUTCOMES: ReadonlyArray<{ value: AppealOutcome; label: string }> = [
  { value: 'uphold', label: 'Uphold' },
  { value: 'overturn', label: 'Overturn' },
  { value: 'modify', label: 'Modify' },
];

/** Modify sets a new action; "none" is an Overturn. */
export const MODIFY_ACTIONS: readonly ModAction[] = ['label', 'limit', 'remove'];

export interface ResolveDraft {
  outcome: AppealOutcome | null;
  finalAction: ModAction | null;
  rationale: string;
}

export type ResolveField = 'outcome' | 'finalAction' | 'rationale';
export type ResolveErrors = Partial<Record<ResolveField, string>>;

export const RESOLVE_FIELDS: readonly ResolveField[] = ['outcome', 'finalAction', 'rationale'];

export const EMPTY_RESOLVE: ResolveDraft = { outcome: null, finalAction: null, rationale: '' };

/** Why an action chip is disabled under Modify, or null: it must differ and be allowed by a decision clause. */
export function modifyActionReason(
  action: ModAction,
  original: { finalAction: ModAction; clauseCodes: readonly string[] },
  clauses: readonly Clause[],
): string | null {
  if (action === original.finalAction) return 'This is the current action. Choose Uphold to keep it.';
  const cited = clauses.filter((c) => original.clauseCodes.includes(c.code));
  if (!cited.some((c) => c.allowedActions.includes(action))) {
    return `None of ${original.clauseCodes.join(', ') || 'the decision clauses'} allows ${action}.`;
  }
  return null;
}

export function validateResolve(
  draft: ResolveDraft,
  original: { finalAction: ModAction; clauseCodes: readonly string[] },
  clauses: readonly Clause[],
): ResolveErrors {
  const errors: ResolveErrors = {};
  if (!draft.outcome) errors.outcome = 'Choose uphold, overturn or modify.';
  if (draft.outcome === 'modify') {
    if (!draft.finalAction) errors.finalAction = 'Choose the new action.';
    else {
      const reason = modifyActionReason(draft.finalAction, original, clauses);
      if (reason) errors.finalAction = reason;
    }
  }
  const rationale = draft.rationale.trim();
  if (rationale.length < MIN_RATIONALE_CHARS) errors.rationale = 'Explain the outcome in at least 10 characters.';
  else if (rationale.length > MAX_RATIONALE_CHARS) errors.rationale = 'Keep it under 2,000 characters.';
  return errors;
}

export function toResolveRequest(draft: ResolveDraft): ResolveRequest {
  const rationale = draft.rationale.trim();
  if (draft.outcome === 'modify') return { outcome: 'modify', finalAction: draft.finalAction ?? 'label', rationale };
  return { outcome: draft.outcome === 'overturn' ? 'overturn' : 'uphold', rationale };
}

const ACTION_PAST: Record<ModAction, string> = {
  none: 'no action',
  label: 'labelled',
  limit: 'limited',
  remove: 'removed',
};

/** "Appeal resolved - decision overturned, the content is visible again." (03 sec. 7 style) */
export function resolveSuccessMessage(result: Pick<ResolvedAppeal, 'outcome' | 'finalAction'>): string {
  if (result.outcome === 'overturn') return 'Appeal resolved - decision overturned, the content is visible again.';
  if (result.outcome === 'modify') return `Appeal resolved - the content is now ${ACTION_PAST[result.finalAction]}.`;
  return 'Appeal resolved - decision upheld.';
}
