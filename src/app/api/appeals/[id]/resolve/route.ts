import { z } from 'zod';
import { handle } from '@/server/http';
import { resolveAppeal, resolveInputSchema } from '@/server/services/appeals';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

// APP-3, APP-5: only a senior moderator who did not make the original decision resolves (403 SAME_REVIEWER).
export const POST = handle(
  { route: 'POST /api/appeals/:id/resolve', auth: ['senior_moderator'], params, body: resolveInputSchema },
  async ({ actor, params, body, requestId }) => resolveAppeal(actor, params.id, body, requestId),
);
