import { handle } from '@/server/http';
import { auditListQuerySchema, listAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

// AUD-5: staff search and filter the audit trail (actor type, action, entity, date range), newest first.
export const GET = handle(
  { route: 'GET /api/audit', auth: ['moderator', 'senior_moderator', 'admin'], query: auditListQuerySchema },
  async ({ query }) => listAudit(query),
);
