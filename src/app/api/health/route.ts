import { handle } from '@/server/http';
import { getHealth } from '@/server/services/status';

export const dynamic = 'force-dynamic';

// OPS-2: flat { ok, db, version } for uptime monitors (the documented exception to the { data } envelope).
export const GET = handle({ route: 'GET /api/health', auth: 'public' }, async () => {
  const health = await getHealth();
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
});
