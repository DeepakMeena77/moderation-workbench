import { handle } from '@/server/http';
import { getStatusReport } from '@/server/services/status';

export const dynamic = 'force-dynamic';

// Public status report (OPS-1); the /status page polls it.
export const GET = handle({ route: 'GET /api/status', auth: 'public' }, () => getStatusReport());
