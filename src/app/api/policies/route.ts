import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { listPolicies, policyTextSchema, publishPolicy } from '@/server/services/policy';

export const dynamic = 'force-dynamic';
// The job runner may run in after() on publish (02 sec. 6); its budget stays below this.
export const maxDuration = 60;

// POL-5: every signed-in user may read the policy and its versions.
export const GET = handle({ route: 'GET /api/policies', auth: 'signed-in' }, async () => listPolicies());

// POL-2, POL-3: an admin publishes; the server assigns the version and starts the re-evaluation run.
export const POST = handle(
  { route: 'POST /api/policies', auth: ['admin'], body: policyTextSchema },
  async ({ actor, body, requestId, log }) => {
    const result = await publishPolicy(actor, body, requestId);
    kickJobRunner(log);
    return result;
  },
);
