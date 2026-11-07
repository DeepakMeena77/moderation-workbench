import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { requestReanalysis } from '@/server/services/cases';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// Q-4: queue a new analysis version. Rate-limited per moderator (SEC-4).
export const POST = handle(
  { route: 'POST /api/cases/:id/reanalyze', auth: ['moderator', 'senior_moderator'], params },
  async ({ actor, params, requestId, log }) => {
    const result = await requestReanalysis(actor, params.id, requestId);
    kickJobRunner(log);
    return result;
  },
);
