import { handle } from '@/server/http';
import { kickJobRunner } from '@/server/jobs/runner';
import { getStatusReport } from '@/server/services/status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Public status report (OPS-1); the /status page polls it, so it also kicks the job runner when work is
// waiting (02 sec. 6). The runner works after the response; the report itself never waits for it.
export const GET = handle({ route: 'GET /api/status', auth: 'public' }, async ({ log }) => {
  const report = await getStatusReport();
  kickJobRunner(log);
  return report;
});
