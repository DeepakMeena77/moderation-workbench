import { z } from 'zod';
import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { contentInputSchema, createComment } from '@/server/services/content';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const params = z.object({ id: z.string().min(1).max(64) });

// CNT-2: an author comments on a post, with the same validation as a post.
export const POST = handle(
  { route: 'POST /api/posts/:id/comments', auth: ['author'], params, body: contentInputSchema },
  async ({ actor, params, body, requestId, log }) => {
    const created = await createComment(actor, params.id, body, requestId);
    kickJobRunner(log);
    return created;
  },
);
