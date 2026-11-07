'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// Audit page data (AUD-3, AUD-5). Response shapes and the two lists mirror src/server/services/audit.ts (the UI
// may not import server code, docs/02 sec. 2); tests/unit/auditLists.test.ts keeps the lists in step.

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
  'appeal.created',
  'appeal.assigned',
  'appeal.brief_created',
  'appeal.resolved',
  'job.failed',
  'job.retried',
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
  'appeal',
  'job',
  'policy',
  'reevaluation',
  'route',
  'page',
] as const;

/** What each action means, in words; the code itself stays in the tooltip and in search (03 sec. 7). */
export const ACTION_LABEL: Record<(typeof AUDIT_ACTIONS)[number], string> = {
  'content.created': 'Content created',
  'report.created': 'Report filed',
  'case.opened': 'Case opened',
  'case.reopened': 'Case reopened',
  'analysis.created': 'Analysis recorded',
  'analysis.requested': 'Re-analysis requested',
  'decision.created': 'Decision made',
  'visibility.changed': 'Visibility changed',
  'appeal.created': 'Appeal filed',
  'appeal.assigned': 'Appeal assigned',
  'appeal.brief_created': 'Appeal summary written',
  'appeal.resolved': 'Appeal resolved',
  'job.failed': 'Job failed',
  'job.retried': 'Job retried',
  'policy.published': 'Policy published',
  'reevaluation.started': 'Re-evaluation started',
  'reevaluation.retried': 'Re-evaluation retried',
  'access.denied': 'Access denied',
};

export const ENTITY_LABEL: Record<(typeof AUDIT_ENTITIES)[number], string> = {
  content: 'Content',
  report: 'Report',
  case: 'Case',
  analysis: 'Analysis',
  decision: 'Decision',
  appeal: 'Appeal',
  job: 'Job',
  policy: 'Policy',
  reevaluation: 'Re-evaluation',
  route: 'API route',
  page: 'Page',
};

/** An action in words; an action written before this list knew it falls back to its code. */
export function actionLabel(action: string): string {
  return (ACTION_LABEL as Record<string, string>)[action] ?? action;
}

export function entityLabel(entityType: string): string {
  return (ENTITY_LABEL as Record<string, string>)[entityType] ?? entityType;
}

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
