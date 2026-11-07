// Shared vocabulary of the moderation core (docs/02-system-design.md sec. 3 and sec. 4). These mirror the Prisma
// enums so the AI layer stays free of database imports; S2's policy schema satisfies PolicyView structurally.

export const MOD_ACTIONS = ['none', 'label', 'limit', 'remove'] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const AI_STATUSES = [
  'ok',
  'timeout',
  'rate_limited',
  'invalid_output',
  'invalid_input',
  'provider_error',
  'budget_exhausted',
  'unavailable',
] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

/** Actions are ordered by strength: none < label < limit < remove. */
export function actionRank(action: ModAction): number {
  return MOD_ACTIONS.indexOf(action);
}

export function strongerAction(a: ModAction, b: ModAction): ModAction {
  return actionRank(a) >= actionRank(b) ? a : b;
}

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity);
}

export function maxSeverity(values: readonly Severity[]): Severity | null {
  let best: Severity | null = null;
  for (const value of values) {
    if (best === null || severityRank(value) > severityRank(best)) best = value;
  }
  return best;
}

/** The part of a policy clause the AI layer and combine read. */
export interface PolicyClauseView {
  code: string;
  title: string;
  text: string;
  defaultSeverity: Severity;
  defaultAction: ModAction;
  allowedActions: readonly ModAction[];
  alwaysEscalate: boolean;
}

export interface PolicyView {
  version: number;
  clauses: readonly PolicyClauseView[];
}

/** A highlighted span of the content: `text` is the exact substring at [start, end). */
export interface QuoteSpan {
  text: string;
  start: number;
  end: number;
}
