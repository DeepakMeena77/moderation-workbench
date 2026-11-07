import { handle } from '@/server/http';
import { listFailedJobs } from '@/server/services/jobs';

export const dynamic = 'force-dynamic';

// OPS-4: the failed jobs an admin can retry from /status, newest first.
export const GET = handle({ route: 'GET /api/jobs/failed', auth: ['admin'] }, async () => listFailedJobs());
