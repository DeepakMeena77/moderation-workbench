import { handle } from '@/server/http';
import { checkCronSecret, processPendingJobs } from '@/server/services/jobs';

export const dynamic = 'force-dynamic';
// One runner pass runs inside the request; JOB_BUDGET_MS keeps it below this.
export const maxDuration = 60;

// OPS-4, SEC-1: the optional external cron (02 sec. 6). Public, but only with the x-cron-secret header; the
// secret never goes in the URL, where it would end up in access logs.
export const GET = handle({ route: 'GET /api/jobs/tick', auth: 'public' }, async ({ req }) => {
  checkCronSecret(req.headers.get('x-cron-secret'));
  return processPendingJobs();
});
