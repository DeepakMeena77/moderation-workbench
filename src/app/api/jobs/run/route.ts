import { handle } from '@/server/http';
import { processPendingJobs } from '@/server/services/jobs';

export const dynamic = 'force-dynamic';
// One runner pass runs inside the request; JOB_BUDGET_MS keeps it below this.
export const maxDuration = 60;

// OPS-4: the admin's "Process pending jobs" button on /status.
export const POST = handle({ route: 'POST /api/jobs/run', auth: ['admin'] }, async () => processPendingJobs());
