import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDatabase, getHealth, getStatusReport } from '@/server/services/status';

vi.mock('@/server/db', () => ({
  getDb: () => ({ $queryRaw: () => Promise.reject(new Error('database is down')) }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('status service', () => {
  it('[OPS-2] health reports ok with a connected database', async () => {
    const health = await getHealth(async () => 1);
    expect(health).toEqual({ ok: true, db: 'connected', version: 'local' });
  });

  it('[OPS-2] health reports unreachable when the database probe fails', async () => {
    const health = await getHealth(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(health).toMatchObject({ ok: false, db: 'unreachable' });
  });

  it('[OPS-2] a database probe that hangs is cut off by the check timeout', async () => {
    const result = await checkDatabase(() => new Promise(() => undefined), 50);
    expect(result).toEqual({ check: 'database', state: 'fail', detail: { latencyMs: null, reason: 'timeout' } });
  });

  it('[OPS-2] GET /api/health returns 503 with a flat body when the database is down', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET(new Request('http://localhost:3000/api/health'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: 'unreachable', version: 'local' });
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('[INFRA] the status report is fail overall when any check fails, ok when all pass', async () => {
    const down = await getStatusReport(async () => {
      throw new Error('down');
    });
    expect(down.overall).toBe('fail');
    expect(down.checks.map((c) => c.check)).toEqual(['app', 'database']);

    const up = await getStatusReport(async () => 1);
    expect(up.overall).toBe('ok');
    expect(up.checks.find((c) => c.check === 'app')?.detail).toMatchObject({ release: 'local' });
  });
});
