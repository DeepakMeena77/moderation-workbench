import { handle } from '@/server/http';
import { appealListQuerySchema, listAppeals } from '@/server/services/appeals';

export const dynamic = 'force-dynamic';

// 03 sec. 6.7: the appeals list. Senior moderators review; moderators and admins may read (02 sec. 7).
export const GET = handle(
  { route: 'GET /api/appeals', auth: ['moderator', 'senior_moderator', 'admin'], query: appealListQuerySchema },
  async ({ actor, query }) => listAppeals(actor, query),
);
