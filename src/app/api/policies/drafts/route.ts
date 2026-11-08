import { handle } from '@/server/http';
import { getPolicyDraft, policyDraftQuerySchema } from '@/server/services/policy';

export const dynamic = 'force-dynamic';

// POL-2: publish shortcuts for admins, read-only: the bundled example policy or the active version as policy JSON.
export const GET = handle(
  { route: 'GET /api/policies/drafts', auth: ['admin'], query: policyDraftQuerySchema },
  async ({ query }) => getPolicyDraft(query.source),
);
