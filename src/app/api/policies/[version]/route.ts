import { handle } from '@/server/http';
import { getPolicy, policyVersionParamsSchema } from '@/server/services/policy';

export const dynamic = 'force-dynamic';

// POL-5: one version with its clauses and the run its publish started.
export const GET = handle(
  { route: 'GET /api/policies/:version', auth: 'signed-in', params: policyVersionParamsSchema },
  async ({ params }) => getPolicy(params.version),
);
