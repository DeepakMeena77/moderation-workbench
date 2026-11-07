import { afterAll, describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { GET as status } from '@/app/api/status/route';
import { getDb } from '@/server/db';

afterAll(async () => {
  await getDb().$disconnect();
});

describe('health and status against the test database', () => {
  it('[OPS-2] GET /api/health returns 200 with a connected database', async () => {
    const res = await health(new Request('http://localhost:3000/api/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, db: 'connected' });
    expect(typeof body.version).toBe('string');
  });

  it('[OPS-2] GET /api/status reports the app and database checks as ok', async () => {
    const res = await status(new Request('http://localhost:3000/api/status'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { overall: string; checks: Array<{ check: string; state: string; detail: Record<string, unknown> }> };
    };
    expect(body.data.overall).toBe('ok');
    expect(body.data.checks.map((c) => [c.check, c.state])).toEqual([
      ['app', 'ok'],
      ['database', 'ok'],
    ]);
    expect(typeof body.data.checks[1]?.detail.latencyMs).toBe('number');
  });
});
