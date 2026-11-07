'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// Audit page data (AUD-3, AUD-5). Response shapes mirror src/server/services/audit.ts (the UI may not import
// server code, docs/02 sec. 2).

export type ActorType = 'human' | 'system' | 'ai';

export const AUDIT_ACTIONS = [
  'content.created',
  'report.created',
  'case.opened',
  'case.reopened',
  'analysis.created',
  'analysis.requested',
  'decision.created',
  'visibility.changed',
  'job.failed',
  'policy.published',
  'reevaluation.started',
  'reevaluation.retried',
  'access.denied',
] as const;

export const AUDIT_ENTITIES = [
  'content',
  'report',
  'case',
  'analysis',
  'decision',
  'job',
  'policy',
  'reevaluation',
  'route',
] as const;

export interface AuditRow {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  policyVersion: number | null;
  requestId: string | null;
  hash: string;
}

export interface AuditPage {
  items: AuditRow[];
  nextCursor: string | null;
  total: number;
}

export interface ChainVerification {
  intact: boolean;
  checked: number;
  firstBrokenId: string | null;
}

/** The filters as the page keeps them in the URL; dates are the viewer's local calendar days (YYYY-MM-DD). */
export interface AuditFilters {
  q?: string;
  actorType?: ActorType;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
}

/** Local calendar days -> the instant range [from 00:00, the day after "to" 00:00) the API expects. */
export function auditApiParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.actorType) params.set('actorType', filters.actorType);
  if (filters.action) params.set('action', filters.action);
  if (filters.entity) params.set('entity', filters.entity);
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    params.set('to', end.toISOString());
  }
  return params;
}

export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['audit', 'events', filters],
    queryFn: ({ pageParam }) => {
      const params = auditApiParams(filters);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<AuditPage>(`/api/audit?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useAuditVerify() {
  return useQuery({
    queryKey: ['audit', 'verify'],
    queryFn: () => api.get<ChainVerification>('/api/audit/verify'),
  });
}
