import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { contentInputSchema, createPost, feedQuerySchema, listFeed } from '@/server/services/content';

export const dynamic = 'force-dynamic';
// The job runner may run in after() on these requests (02 sec. 6); its budget stays below this.
export const maxDuration = 60;

// The feed (CNT-5): visibility-aware, newest first. A polling endpoint, so it also kicks the job runner when
// work is waiting.
export const GET = handle(
  { route: 'GET /api/posts', auth: 'signed-in', query: feedQuerySchema },
  async ({ actor, query, log }) => {
    const page = await listFeed(actor, query);
    kickJobRunner(log);
    return page;
  },
);

// CNT-1: an author posts; the case and the analyse job are created in the same transaction.
export const POST = handle(
  { route: 'POST /api/posts', auth: ['author'], body: contentInputSchema },
  async ({ actor, body, requestId, log }) => {
    const created = await createPost(actor, body, requestId);
    kickJobRunner(log);
    return created;
  },
);
