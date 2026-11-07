import { handle } from '@/server/http';
import { compareQuerySchema, comparePolicies } from '@/server/services/policy';

export const dynamic = 'force-dynamic';

// POL-5: clauses added, removed and changed (field-level) between any two versions.
export const GET = handle(
  { route: 'GET /api/policies/compare', auth: 'signed-in', query: compareQuerySchema },
  async ({ query }) => comparePolicies(query.from, query.to),
);
