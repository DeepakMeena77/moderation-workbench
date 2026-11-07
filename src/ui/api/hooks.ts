'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
