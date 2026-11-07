import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { caseListQuerySchema, listCases } from '@/server/services/cases';

export const dynamic = 'force-dynamic';
// A polling endpoint: the job runner may run in after() (02 sec. 6); its budget stays below this.
export const maxDuration = 60;

// Q-1: the moderation queue. Staff only; admins read it for oversight (HUM-7).
export const GET = handle(
  { route: 'GET /api/cases', auth: ['moderator', 'senior_moderator', 'admin'], query: caseListQuerySchema },
  async ({ query, log }) => {
    const page = await listCases(query);
    kickJobRunner(log);
    return page;
  },
);
