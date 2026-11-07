import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { retryJob } from '@/server/services/jobs';

export const dynamic = 'force-dynamic';
// The job runner may run in after(); its budget stays below this.
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// OPS-4: an admin puts one failed job back in the queue; 409 INVALID_TRANSITION unless it failed.
export const POST = handle(
  { route: 'POST /api/jobs/:id/retry', auth: ['admin'], params },
  async ({ actor, params: { id }, requestId, log }) => {
    const result = await retryJob(actor, id, requestId);
    kickJobRunner(log);
    return result;
  },
);
