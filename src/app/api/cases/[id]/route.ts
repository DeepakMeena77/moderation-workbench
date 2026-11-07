import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { getCase } from '@/server/services/cases';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// The case page (03 sec. 6.6). Admins get the same view with no decision permissions (HUM-7).
export const GET = handle(
  { route: 'GET /api/cases/:id', auth: ['moderator', 'senior_moderator', 'admin'], params },
  async ({ actor, params, log }) => {
    const detail = await getCase(actor, params.id);
    if (detail.analysisPending) kickJobRunner(log);
    return detail;
  },
);
