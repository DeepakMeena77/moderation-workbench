'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { api } from './client';

// Response shapes mirror src/server/services (the UI may not import server code, docs/02 sec. 2).

export type CheckState = 'ok' | 'warn' | 'fail';

export interface StatusCheck {
  check: string;
  state: CheckState;
  detail: Record<string, string | number | null>;
}

export interface StatusReport {
  overall: CheckState;
  checkedAt: string;
  checks: StatusCheck[];
}

export const STATUS_REFRESH_MS = 30_000; // docs/03-ui-ux.md sec. 6.12

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<StatusReport>('/api/status'),
    refetchInterval: STATUS_REFRESH_MS,
  });
}

// --- Auth (S1) ---

export type Role = 'author' | 'moderator' | 'senior_moderator' | 'admin';

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface DemoAccount {
  key: string;
  email: string;
  name: string;
  role: Role;
  /** Shown as "Try: <hint>" on the sign-in card. */
  hint: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export function useSignIn() {
  return useMutation({
    mutationFn: (input: SignInInput) => api.post<{ user: Me }>('/api/auth/sign-in', input),
  });
}

export function useDemoSignIn() {
  return useMutation({
    mutationFn: (account: string) => api.post<{ user: Me }>('/api/auth/demo', { account }),
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: () => api.post<{ signedOut: true }>('/api/auth/sign-out'),
  });
}

/**
 * After the signed-in user changes (sign-in, sign-out, demo switch): drop every cached query so one user's
 * data never shows for the next, then navigate and re-run the server layout, which re-reads the session.
 */
export function useAfterAuthChange(): (href: string) => void {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    (href: string) => {
      queryClient.clear();
      router.replace(href);
      router.refresh();
    },
    [queryClient, router],
  );
}

// --- Feed (S2) ---

export type Visibility = 'visible' | 'labeled' | 'limited' | 'removed';

export interface FeedItem {
  id: string;
  type: 'post' | 'comment';
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  visibility: Visibility;
  isOwn: boolean;
  viewerReported: boolean;
  analysing: boolean;
  moderation: { clauseCodes: string[]; appealUntil: string | null };
}

export interface FeedPost extends FeedItem {
  comments: FeedItem[];
}

export interface FeedPage {
  items: FeedPost[];
  nextCursor: string | null;
}

export interface CreatedContent {
  id: string;
  type: 'post' | 'comment';
  caseId: string;
  policyVersion: number | null;
}

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'threat', label: 'Threat' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'hate', label: 'Hate' },
  { value: 'private_info', label: 'Private info' },
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam' },
  { value: 'other', label: 'Other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** While the viewer's own items are being analysed, the feed polls (no push, 01 sec. 6). */
export const FEED_POLL_MS = 2000;
const FEED_KEY = ['feed'] as const;

function anyAnalysing(data: InfiniteData<FeedPage> | undefined): boolean {
  return (
    data?.pages.some((page) =>
      page.items.some((post) => post.analysing || post.comments.some((comment) => comment.analysing)),
    ) ?? false
  );
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: FEED_KEY,
    queryFn: ({ pageParam }) =>
      api.get<FeedPage>(pageParam ? `/api/posts?cursor=${encodeURIComponent(pageParam)}` : '/api/posts'),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: (query) => (anyAnalysing(query.state.data) ? FEED_POLL_MS : false),
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<CreatedContent>('/api/posts', { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<CreatedContent>(`/api/posts/${encodeURIComponent(postId)}/comments`, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

export function useReportContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { contentId: string; reason: ReportReason; note?: string }) =>
      api.post<{ reported: true }>(`/api/content/${encodeURIComponent(input.contentId)}/reports`, {
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

// --- Queue and case review (S4) ---

export type CaseStatus =
  'pending_analysis' | 'auto_cleared' | 'awaiting_review' | 'resolved' | 'appealed' | 'appeal_resolved';
export type ModAction = 'none' | 'label' | 'limit' | 'remove';
export type Severity = 'low' | 'medium' | 'high';
export type AiStatus =
  | 'ok'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_output'
  | 'invalid_input'
  | 'provider_error'
  | 'budget_exhausted'
  | 'unavailable';
export type CaseTrigger = 'new_content' | 'report' | 'reopen';

export const QUEUE_STATUSES = ['awaiting_review', 'pending_analysis', 'auto_cleared'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export interface QueueFilters {
  status: QueueStatus;
  severity?: Severity;
  trigger?: CaseTrigger;
  policy?: number;
  ai?: 'ok' | 'unavailable';
  q?: string;
}

export interface CaseRow {
  id: string;
  status: CaseStatus;
  trigger: CaseTrigger;
  priority: number;
  reportCount: number;
  createdAt: string;
  content: { id: string; type: 'post' | 'comment'; excerpt: string; authorName: string };
  analysis: {
    seq: number;
    policyVersion: number;
    aiStatus: AiStatus;
    action: ModAction;
    severity: Severity | null;
    clauseCodes: string[];
  } | null;
}

export interface CaseListPage {
  items: CaseRow[];
  total: number;
  nextCursor: string | null;
}

export interface Recommendation {
  action: ModAction;
  severity: Severity | null;
  confidence: number | null;
  needsHuman: boolean;
  reasons: string[];
  autoClear: boolean;
  priority: number;
  clauseCodes: string[];
}

export interface Finding {
  source: 'rule' | 'ai';
  ruleId: string | null;
  clauseCode: string;
  evidenceType: 'confirmed' | 'interpretation';
  quotes: Array<{ text: string; start: number | null; end: number | null }>;
  interpretation: string | null;
  severity: Severity;
  severityReason: string | null;
  confidence: number;
  confidenceReason: string | null;
}

export interface AiDetail {
  findings: Finding[];
  invalidCitations: string[];
  unverifiedQuotes: string[];
  actionLowered: { from: ModAction; to: ModAction } | null;
  severityReason: string | null;
  confidenceReason: string | null;
  insufficientContext: boolean;
}

export interface AiRun {
  provider: string;
  model: string;
  modelsTried: string[];
  fallbackUsed: boolean;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
  attempts: number;
  parseStrategy: string | null;
  repairUsed: boolean;
  status: AiStatus;
  errorCode: string | null;
}

export interface Analysis {
  id: string;
  seq: number;
  policyVersion: number;
  reason: string;
  createdAt: string;
  aiStatus: AiStatus;
  recommendation: Recommendation;
  ruleFindings: Finding[];
  ai: AiDetail | null;
  aiRun: AiRun | null;
}

export interface Clause {
  code: string;
  title: string;
  text: string;
  defaultSeverity: Severity;
  defaultAction: ModAction;
  allowedActions: ModAction[];
}

export interface DecisionSummary {
  id: string;
  kind: 'approve' | 'reject' | 'modify';
  decider: { id: string; name: string };
  analysisSeq: number;
  policyVersion: number;
  recommendedAction: ModAction;
  finalAction: ModAction;
  clauseCodes: string[];
  reasonCategory: string | null;
  rationale: string | null;
  createdAt: string;
  /** POL-4: set when a newer policy version is active than this decision's. */
  policyChange: PolicyChange | null;
}

/** "Policy changed since this decision (v1 -> v2)" (POL-4); the server builds the message. */
export interface PolicyChange {
  fromVersion: number;
  toVersion: number;
  message: string;
}

export interface CaseDetail {
  id: string;
  status: CaseStatus;
  trigger: CaseTrigger;
  priority: number;
  reportCount: number;
  createdAt: string;
  content: {
    id: string;
    type: 'post' | 'comment';
    body: string;
    createdAt: string;
    visibility: Visibility;
    author: { id: string; name: string };
    parent: { id: string; body: string; authorName: string } | null;
  };
  reportReasons: Array<{ reason: string; count: number }>;
  analysis: Analysis | null;
  versions: Array<{
    id: string;
    seq: number;
    policyVersion: number;
    reason: string;
    aiStatus: AiStatus;
    action: ModAction;
    createdAt: string;
  }>;
  decision: DecisionSummary | null;
  analysisPending: boolean;
  policy: { version: number; clauses: Clause[] } | null;
  permissions: { canDecide: boolean; canReanalyze: boolean; canReopen: boolean; readOnly: boolean };
}

export type DecisionRequest =
  | { kind: 'approve'; analysisId: string }
  | { kind: 'reject'; analysisId: string; reasonCategory: string; rationale: string }
  | {
      kind: 'modify';
      analysisId: string;
      finalAction: ModAction;
      clauseCodes: string[];
      reasonCategory: string;
      rationale: string;
    };

export interface DecisionResult {
  decisionId: string;
  kind: 'approve' | 'reject' | 'modify';
  recommendedAction: ModAction;
  finalAction: ModAction;
  clauseCodes: string[];
  policyVersion: number;
  visibility: Visibility;
}

/** The queue refreshes in the background; the "Analysing" view and pending cases poll faster (no push). */
export const QUEUE_REFRESH_MS = 30_000;
export const CASE_POLL_MS = 2000;
const CASES_KEY = ['cases'] as const;

/** Query string for /api/cases and the page URL (Q-1). Defaults are left out so URLs stay short. */
export function queueSearch(filters: QueueFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (filters.status !== 'awaiting_review') params.set('status', filters.status);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.trigger) params.set('trigger', filters.trigger);
  if (filters.policy) params.set('policy', String(filters.policy));
  if (filters.ai) params.set('ai', filters.ai);
  if (filters.q) params.set('q', filters.q);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function useCases(filters: QueueFilters) {
  return useInfiniteQuery({
    queryKey: [...CASES_KEY, filters],
    queryFn: ({ pageParam }) =>
      api.get<CaseListPage>(`/api/cases${queueSearch(filters, pageParam ? { cursor: pageParam } : {})}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: filters.status === 'pending_analysis' ? CASE_POLL_MS * 2 : QUEUE_REFRESH_MS,
  });
}

export function useCase(caseId: string | null) {
  return useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.get<CaseDetail>(`/api/cases/${encodeURIComponent(caseId ?? '')}`),
    enabled: caseId !== null,
    refetchInterval: (query) =>
      query.state.data?.analysisPending || query.state.data?.status === 'pending_analysis' ? CASE_POLL_MS : false,
  });
}

function useCaseMutation<TInput, TResult>(caseId: string, request: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['case', caseId] }),
        queryClient.invalidateQueries({ queryKey: CASES_KEY }),
      ]);
    },
  });
}

export function useDecide(caseId: string) {
  return useCaseMutation(caseId, (input: DecisionRequest) =>
    api.post<DecisionResult>(`/api/cases/${encodeURIComponent(caseId)}/decisions`, input),
  );
}

export function useReanalyze(caseId: string) {
  return useCaseMutation(caseId, () =>
    api.post<{ queued: true }>(`/api/cases/${encodeURIComponent(caseId)}/reanalyze`),
  );
}

export function useReopen(caseId: string) {
  return useCaseMutation(caseId, () =>
    api.post<{ status: CaseStatus }>(`/api/cases/${encodeURIComponent(caseId)}/reopen`),
  );
}

// --- My content, history and appeals (S5) ---

export type AppealStatus = 'pending' | 'resolved';
export type AppealOutcome = 'uphold' | 'overturn' | 'modify';

export interface Appealability {
  canAppeal: boolean;
  until: string | null;
  reason: string | null;
}

export interface MyContentItem {
  id: string;
  type: 'post' | 'comment';
  body: string;
  createdAt: string;
  visibility: Visibility;
  caseStatus: CaseStatus | null;
  decision: {
    id: string;
    finalAction: ModAction;
    clauses: Array<{ code: string; title: string | null }>;
    decidedAt: string;
    summary: string;
  } | null;
  appeal: {
    id: string;
    status: AppealStatus;
    outcome: AppealOutcome | null;
    finalAction: ModAction | null;
    createdAt: string;
    resolvedAt: string | null;
    summary: string;
  } | null;
  appealability: Appealability | null;
}

export interface MyContentPage {
  items: MyContentItem[];
  nextCursor: string | null;
}

const MY_CONTENT_KEY = ['my-content'] as const;

function anyChecking(data: InfiniteData<MyContentPage> | undefined): boolean {
  return data?.pages.some((page) => page.items.some((item) => item.caseStatus === 'pending_analysis')) ?? false;
}

export function useMyContent() {
  return useInfiniteQuery({
    queryKey: MY_CONTENT_KEY,
    queryFn: ({ pageParam }) =>
      api.get<MyContentPage>(pageParam ? `/api/me/content?cursor=${encodeURIComponent(pageParam)}` : '/api/me/content'),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: (query) => (anyChecking(query.state.data) ? FEED_POLL_MS : false),
  });
}

export interface AppealRequest {
  statement: string;
  evidenceLinks: string[];
  evidenceNote?: string;
}

export interface CreatedAppeal {
  appealId: string;
  status: AppealStatus;
  assigned: boolean;
  deadline: string;
}

export function useCreateAppeal(decisionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AppealRequest) =>
      api.post<CreatedAppeal>(`/api/decisions/${encodeURIComponent(decisionId)}/appeals`, input),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MY_CONTENT_KEY }),
        queryClient.invalidateQueries({ queryKey: FEED_KEY }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
      ]);
    },
  });
}

export type HistoryEventKind =
  | 'created'
  | 'reported'
  | 'analysis'
  | 'decision'
  | 'appeal'
  | 'appeal_assigned'
  | 'appeal_brief'
  | 'appeal_resolved'
  | 'visibility';

export interface HistoryEvent {
  id: string;
  at: string;
  kind: HistoryEventKind;
  title: string;
  lines: string[];
  action: ModAction | null;
  policyVersion: number | null;
  facts?: Array<{ label: string; value: string }>;
  policyChange?: PolicyChange;
}

export interface ContentHistory {
  view: 'author' | 'staff';
  content: {
    id: string;
    type: 'post' | 'comment';
    body: string;
    createdAt: string;
    visibility: Visibility;
    authorName: string | null;
  };
  caseStatus: CaseStatus | null;
  events: HistoryEvent[];
  auditEvents?: Array<{
    id: string;
    at: string;
    action: string;
    actorType: 'human' | 'system' | 'ai';
    actorName: string | null;
    entityType: string;
  }>;
}

export function useHistory(contentId: string) {
  return useQuery({
    queryKey: ['history', contentId],
    queryFn: () => api.get<ContentHistory>(`/api/content/${encodeURIComponent(contentId)}/history`),
  });
}

export interface AppealRow {
  id: string;
  status: AppealStatus;
  outcome: AppealOutcome | null;
  createdAt: string;
  resolvedAt: string | null;
  assignedToMe: boolean;
  assignedReviewer: { id: string; name: string } | null;
  ownDecision: boolean;
  content: { id: string; type: 'post' | 'comment'; excerpt: string; authorName: string };
  decision: { finalAction: ModAction; clauseCodes: string[]; deciderName: string };
}

export interface AppealListPage {
  items: AppealRow[];
  total: number;
  unassigned: number;
}

export type AppealBriefView =
  | { state: 'pending' }
  | { state: 'unavailable'; reason: string }
  | {
      state: 'ready';
      summary: string;
      newPoints: string[];
      disputedFindings: Array<{ clauseCode: string; authorClaim: string }>;
      droppedClauses: string[];
      model: string | null;
      costUsd: number | null;
    };

export interface AppealDetail {
  id: string;
  status: AppealStatus;
  createdAt: string;
  caseId: string;
  caseStatus: CaseStatus;
  content: {
    id: string;
    type: 'post' | 'comment';
    body: string;
    createdAt: string;
    visibility: Visibility;
    author: { id: string; name: string };
  };
  original: {
    decisionId: string;
    kind: 'approve' | 'reject' | 'modify';
    finalAction: ModAction;
    recommendedAction: ModAction;
    clauseCodes: string[];
    reasonCategory: string | null;
    rationale: string | null;
    decider: { id: string; name: string };
    policyVersion: number;
    analysisSeq: number;
    createdAt: string;
    findings: Finding[];
  };
  evidence: { statement: string; links: string[]; note: string | null };
  brief: AppealBriefView;
  outcome: {
    outcome: AppealOutcome;
    finalAction: ModAction;
    rationale: string;
    resolver: { id: string; name: string };
    resolvedAt: string;
  } | null;
  assignedReviewer: { id: string; name: string } | null;
  policyChangedSinceDecision: boolean;
  activePolicyVersion: number | null;
  newerAnalysis: {
    seq: number;
    policyVersion: number;
    reason: string;
    action: ModAction;
    clauseCodes: string[];
  } | null;
  clauses: Clause[];
  permissions: { canResolve: boolean; isOriginalDecider: boolean; readOnly: boolean };
}

export type ResolveRequest =
  | { outcome: 'uphold'; rationale: string }
  | { outcome: 'overturn'; rationale: string }
  | { outcome: 'modify'; finalAction: ModAction; rationale: string };

export interface ResolvedAppeal {
  appealId: string;
  outcome: AppealOutcome;
  originalAction: ModAction;
  finalAction: ModAction;
  visibility: Visibility;
}

const APPEALS_KEY = ['appeals'] as const;

export function useAppeals(status: AppealStatus) {
  return useQuery({
    queryKey: [...APPEALS_KEY, status],
    queryFn: () => api.get<AppealListPage>(status === 'pending' ? '/api/appeals' : '/api/appeals?status=resolved'),
    refetchInterval: QUEUE_REFRESH_MS,
  });
}

export function useAppeal(appealId: string | null) {
  return useQuery({
    queryKey: ['appeal', appealId],
    queryFn: () => api.get<AppealDetail>(`/api/appeals/${encodeURIComponent(appealId ?? '')}`),
    enabled: appealId !== null,
    // While the AI brief is being written the page polls; nothing else on it changes by itself.
    refetchInterval: (query) => (query.state.data?.brief.state === 'pending' ? CASE_POLL_MS : false),
  });
}

export function useResolveAppeal(appealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveRequest) =>
      api.post<ResolvedAppeal>(`/api/appeals/${encodeURIComponent(appealId)}/resolve`, input),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appeal', appealId] }),
        queryClient.invalidateQueries({ queryKey: APPEALS_KEY }),
      ]);
    },
  });
}
