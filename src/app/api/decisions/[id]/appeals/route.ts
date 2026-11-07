import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { appealInputSchema, createAppeal } from '@/server/services/appeals';

export const dynamic = 'force-dynamic';
// The appeal brief job may run in after() on this request (02 sec. 6); its budget stays below this.
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// APP-1, APP-2: the content author appeals a decision. The service refuses anyone but that author (SEC-2).
export const POST = handle(
  { route: 'POST /api/decisions/:id/appeals', auth: ['author'], params, body: appealInputSchema },
  async ({ actor, params, body, requestId, log }) => {
    const created = await createAppeal(actor, params.id, body, requestId);
    kickJobRunner(log);
    return created;
  },
);
