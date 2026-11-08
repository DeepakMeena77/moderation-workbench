'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

// Policy page data (POL-2..5). Response shapes mirror src/server/services/policy.ts and reevaluation.ts (the UI
// may not import server code, docs/02 sec. 2). Kept beside the feature, not in api/hooks.ts, so slices that
// add pages in parallel do not edit the same file.

export type ClauseAction = 'label' | 'limit' | 'remove';

export interface PolicyClause {
  code: string;
  title: string;
  text: string;
  defaultSeverity: 'low' | 'medium' | 'high';
  defaultAction: ClauseAction;
  allowedActions: ClauseAction[];
  signals: {
    keywords?: string[];
    patterns?: string[];
    linkThreshold?: number;
    contactDetails?: boolean;
    addressPattern?: string;
  };
  alwaysEscalate: boolean;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface PolicyDiff {
  added: PolicyClause[];
  removed: PolicyClause[];
  changed: Array<{ code: string; title: string; changes: FieldChange[] }>;
  unchanged: string[];
}

export type RunState = 'running' | 'finished' | 'finished_with_failures';

export interface ReevaluationRun {
  id: string;
  fromVersion: number;
  toVersion: number;
  total: number;
  done: number;
  failed: number;
  state: RunState;
  createdAt: string;
  finishedAt: string | null;
}

export interface PolicySummary {
  version: number;
  status: 'active' | 'retired';
  notes: string | null;
  publishedAt: string;
  publishedBy: string | null;
  clauseCount: number;
  clauseCodes: string[];
}

export interface PolicyDetail extends PolicySummary {
  clauses: PolicyClause[];
  run: ReevaluationRun | null;
}

export interface PolicyList {
  versions: PolicySummary[];
  latestRun: ReevaluationRun | null;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface PolicyValidation {
  valid: boolean;
  errors: ValidationIssue[];
  preview: {
    fromVersion: number | null;
    nextVersion: number;
    diff: PolicyDiff;
    sameAsVersion: number | null;
    impact: { unresolvedCases: number };
  } | null;
}

/** The run card polls every 2 s while the run is going (02 sec. 6). */
export const RUN_POLL_MS = 2000;
const POLICIES_KEY = ['policies'] as const;

export function usePolicies() {
  return useQuery({ queryKey: POLICIES_KEY, queryFn: () => api.get<PolicyList>('/api/policies') });
}

export function usePolicy(version: number | null) {
  return useQuery({
    queryKey: [...POLICIES_KEY, 'version', version],
    queryFn: () => api.get<PolicyDetail>(`/api/policies/${version}`),
    enabled: version !== null,
  });
}

export function useCompare(from: number | null, to: number | null) {
  return useQuery({
    queryKey: [...POLICIES_KEY, 'compare', from, to],
    queryFn: () =>
      api.get<{ from: number; to: number; diff: PolicyDiff }>(`/api/policies/compare?from=${from}&to=${to}`),
    enabled: from !== null && to !== null && from !== to,
  });
}

export function useValidatePolicy() {
  return useMutation({
    mutationFn: (json: string) => api.post<PolicyValidation>('/api/policies/validate', { json }),
  });
}

export type PolicyDraftSource = 'example' | 'active';

/** A starting point for the editor: the bundled example policy (v2) or the active version, as policy-file JSON. */
export function usePolicyDraft() {
  return useMutation({
    mutationFn: (source: PolicyDraftSource) =>
      api.get<{ source: PolicyDraftSource; text: string }>(`/api/policies/drafts?source=${source}`),
  });
}

export function usePublishPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: string) => api.post<{ version: number; run: ReevaluationRun }>('/api/policies', { json }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: POLICIES_KEY }),
  });
}

export function useReevaluationRun(id: string | null) {
  return useQuery({
    queryKey: ['reevaluation', id],
    queryFn: () => api.get<ReevaluationRun>(`/api/reevaluations/${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.state === 'running' ? RUN_POLL_MS : false),
  });
}

export function useRetryFailed(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ run: ReevaluationRun; retried: number }>(`/api/reevaluations/${encodeURIComponent(id)}/retry`),
    onSuccess: (result) => queryClient.setQueryData(['reevaluation', id], result.run),
  });
}
