import { handle } from '@/server/http';
import { getMetrics } from '@/server/services/metrics';

export const dynamic = 'force-dynamic';

// OPS-6: agreement, overrides, AI failures, latency, tokens and cost.
export const GET = handle({ route: 'GET /api/metrics', auth: ['moderator', 'senior_moderator', 'admin'] }, async () =>
  getMetrics(),
);
