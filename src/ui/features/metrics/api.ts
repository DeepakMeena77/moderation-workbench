'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

// Metrics page data (OPS-6). The shape mirrors src/server/services/metrics.ts (the UI may not import server
// code, docs/02 sec. 2).

export interface UsageTotals {
  runs: number;
  tokens: number;
  costUsd: number;
}

export interface Metrics {
  generatedAt: string;
  windowDays: number;
  agreement: { decisions: number; agreed: number; rate: number | null };
  overrides: { total: number; byReason: Array<{ reason: string; count: number }> };
  aiFailures: { runs: number; failed: number; rate: number | null; byStatus: Array<{ status: string; count: number }> };
  latency: { runs: number; p50Ms: number | null; p90Ms: number | null };
  autoClear: { cleared: number; revisited: number; rate: number | null };
  usage: { last24h: UsageTotals; last7d: UsageTotals; byDay: Array<UsageTotals & { day: string }> };
}

export const METRICS_REFRESH_MS = 60_000;

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<Metrics>('/api/metrics'),
    refetchInterval: METRICS_REFRESH_MS,
  });
}
