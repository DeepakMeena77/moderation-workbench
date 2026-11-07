import { z } from 'zod';
import { handle } from '@/server/http';
import { getContentHistory } from '@/server/services/history';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

// CNT-4: the item's moderation history. Staff get the full view; the author a plain one; anyone else 403 (SEC-2).
export const GET = handle(
  { route: 'GET /api/content/:id/history', auth: 'signed-in', params },
  async ({ actor, params }) => getContentHistory(actor, params.id),
);
