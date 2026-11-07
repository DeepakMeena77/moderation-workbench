import { handle } from '@/server/http';
import { policyTextSchema, validatePolicy } from '@/server/services/policy';

export const dynamic = 'force-dynamic';

// POL-2: an invalid policy is a normal answer here (200 with errors and paths), not a failed request. Nothing is
// written; the preview shows the diff against the active version and how many cases would be re-analysed.
export const POST = handle(
  { route: 'POST /api/policies/validate', auth: ['admin'], body: policyTextSchema },
  async ({ body }) => validatePolicy(body),
);
