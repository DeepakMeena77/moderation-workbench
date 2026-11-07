import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { createReport, reportInputSchema } from '@/server/services/reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// CNT-3: any signed-in user reports someone else's content (own content: 403; twice: 409).
export const POST = handle(
  { route: 'POST /api/content/:id/reports', auth: 'signed-in', params, body: reportInputSchema },
  async ({ actor, params, body, requestId, log }) => {
    const result = await createReport(actor, params.id, body, requestId);
    kickJobRunner(log);
    return result;
  },
);
