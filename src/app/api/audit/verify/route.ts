import { handle } from '@/server/http';
import { verifyChain } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

// AUD-3: recomputes the hash chain and reports "intact" or the first broken event.
export const GET = handle(
  { route: 'GET /api/audit/verify', auth: ['moderator', 'senior_moderator', 'admin'] },
  async () => verifyChain(),
);
