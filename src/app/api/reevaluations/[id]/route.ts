import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { getRun } from '@/server/services/reevaluation';

export const dynamic = 'force-dynamic';
// A polling endpoint (the policy page polls every 2 s), so it also kicks the job runner (02 sec. 6).
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// POL-3: live progress of a re-evaluation run.
export const GET = handle(
  {
    route: 'GET /api/reevaluations/:id',
    auth: ['moderator', 'senior_moderator', 'admin'],
    params,
  },
  async ({ params, log }) => {
    const run = await getRun(params.id);
    if (run.state === 'running') kickJobRunner(log);
    return run;
  },
);
