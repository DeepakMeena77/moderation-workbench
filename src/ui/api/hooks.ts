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
