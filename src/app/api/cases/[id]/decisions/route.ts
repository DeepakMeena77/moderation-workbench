import { z } from 'zod';
import { handle } from '@/server/http';
import { decide, decisionInputSchema } from '@/server/services/decisions';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

// HUM-2..7: approve, reject or modify the recommendation. Admins have no decision route (403).
export const POST = handle(
  {
    route: 'POST /api/cases/:id/decisions',
    auth: ['moderator', 'senior_moderator'],
    params,
    body: decisionInputSchema,
  },
  async ({ actor, params, body, requestId }) => decide(actor, params.id, body, requestId),
);
