import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { retryFailed } from '@/server/services/reevaluation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// POL-3: Retry failed puts the run's failed jobs back in the queue (staff and admin, 02 sec. 7).
export const POST = handle(
  { route: 'POST /api/reevaluations/:id/retry', auth: ['moderator', 'senior_moderator', 'admin'], params },
  async ({ actor, params, requestId, log }) => {
    const result = await retryFailed(actor, params.id, requestId);
    kickJobRunner(log);
    return result;
  },
);
