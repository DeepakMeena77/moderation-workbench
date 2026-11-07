import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { listMyContent, myContentQuerySchema } from '@/server/services/content';

export const dynamic = 'force-dynamic';
// A polling endpoint: the job runner may run in after() (02 sec. 6); its budget stays below this.
export const maxDuration = 60;

// My content (03 sec. 6.3): the author's own items with status, decision, appeal state and deadline.
export const GET = handle(
  { route: 'GET /api/me/content', auth: ['author'], query: myContentQuerySchema },
  async ({ actor, query, log }) => {
    const page = await listMyContent(actor, query);
    kickJobRunner(log);
    return page;
  },
);
