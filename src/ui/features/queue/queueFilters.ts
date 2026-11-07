import { QUEUE_STATUSES, type QueueFilters, type QueueStatus } from '../../api/hooks';

// Queue filters live in the URL (Q-1), so a reload, the back button or a shared link keeps them. Unknown or
// malformed values are dropped rather than sent to the API, where they would be a 400.

interface ParamsLike {
  get(name: string): string | null;
}

const SEVERITIES = ['low', 'medium', 'high'] as const;
const TRIGGERS = ['new_content', 'report', 'reopen'] as const;
const AI = ['ok', 'unavailable'] as const;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((v) => v === value);
}

export function parseQueueFilters(params: ParamsLike): QueueFilters {
  const filters: QueueFilters = {
    status: oneOf<QueueStatus>(QUEUE_STATUSES, params.get('status')) ?? 'awaiting_review',
  };
  const severity = oneOf(SEVERITIES, params.get('severity'));
  if (severity) filters.severity = severity;
  const trigger = oneOf(TRIGGERS, params.get('trigger'));
  if (trigger) filters.trigger = trigger;
  const policy = Number(params.get('policy'));
  if (Number.isInteger(policy) && policy > 0) filters.policy = policy;
  const ai = oneOf(AI, params.get('ai'));
  if (ai) filters.ai = ai;
  const q = params.get('q')?.trim().slice(0, 200);
  if (q) filters.q = q;
  return filters;
}

/** Any filter beyond the default status, so the empty state can offer "Clear filters". */
export function hasNarrowingFilters(filters: QueueFilters): boolean {
  return Boolean(filters.severity || filters.trigger || filters.policy || filters.ai || filters.q);
}
