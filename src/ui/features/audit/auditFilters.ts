import { AUDIT_ACTIONS, AUDIT_ENTITIES, type ActorType, type AuditFilters } from './api';

// Audit filters live in the URL (AUD-5), so a reload or a shared link keeps them. Unknown or malformed values
// are dropped rather than sent to the API, where they would be a 400.

interface ParamsLike {
  get(name: string): string | null;
}

const ACTOR_TYPES: readonly ActorType[] = ['human', 'system', 'ai'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((v) => v === value);
}

function validDate(value: string | null): string | undefined {
  return value && DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? value : undefined;
}

export function parseAuditFilters(params: ParamsLike): AuditFilters {
  const filters: AuditFilters = {};
  const q = params.get('q')?.trim().slice(0, 200);
  if (q) filters.q = q;
  const actorType = oneOf(ACTOR_TYPES, params.get('actorType'));
  if (actorType) filters.actorType = actorType;
  const action = oneOf(AUDIT_ACTIONS, params.get('action'));
  if (action) filters.action = action;
  const entity = oneOf(AUDIT_ENTITIES, params.get('entity'));
  if (entity) filters.entity = entity;
  const from = validDate(params.get('from'));
  if (from) filters.from = from;
  const to = validDate(params.get('to'));
  if (to) filters.to = to;
  return filters;
}

export function auditSearch(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'actorType', 'action', 'entity', 'from', 'to'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** An end date before the start date: shown as a field error, and not sent to the API. */
export function rangeError(filters: AuditFilters): string | null {
  return filters.from && filters.to && filters.to < filters.from
    ? 'Pick an end date on or after the start date.'
    : null;
}

export function hasAuditFilters(filters: AuditFilters): boolean {
  return Object.values(filters).some(Boolean);
}
