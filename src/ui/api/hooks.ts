'use client';

import { useQuery } from '@tanstack/react-query';
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
