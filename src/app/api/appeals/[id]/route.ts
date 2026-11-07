import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { getAppeal } from '@/server/services/appeals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// APP-4: the appeal review page (original decision, appeal evidence, outcome, AI summary). While the brief is
// pending the page polls, and this request kicks the job runner.
export const GET = handle(
  { route: 'GET /api/appeals/:id', auth: ['moderator', 'senior_moderator', 'admin'], params },
  async ({ actor, params, log }) => {
    const detail = await getAppeal(actor, params.id);
    if (detail.brief.state === 'pending') kickJobRunner(log);
    return detail;
  },
);
