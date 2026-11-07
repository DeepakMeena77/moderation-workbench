import { z } from 'zod';
import { handle } from '@/server/http';
import { reopenCase } from '@/server/services/cases';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

// Q-4: an auto-cleared case goes back to awaiting_review (audited).
export const POST = handle(
  { route: 'POST /api/cases/:id/reopen', auth: ['moderator', 'senior_moderator'], params },
  async ({ actor, params, requestId }) => reopenCase(actor, params.id, requestId),
);
