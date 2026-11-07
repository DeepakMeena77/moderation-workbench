import { afterAll, describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/health/route';
import { GET as status } from '@/app/api/status/route';
import { getDb } from '@/server/db';
import { installPolicy } from './helpers/moderation';

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

  it('[OPS-1] GET /api/status checks the whole journey: app, database, AI model, jobs, policy and AI usage', async () => {
    await installPolicy(1);
    const res = await status(new Request('http://localhost:3000/api/status'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { overall: string; checks: Array<{ check: string; state: string; detail: Record<string, unknown> }> };
    };
    expect(body.data.checks.map((c) => [c.check, c.state])).toEqual([
      ['app', 'ok'],
      ['database', 'ok'],
      ['llm', 'ok'],
      ['jobs', 'ok'],
      ['policy', 'ok'],
      ['aiUsage', 'ok'],
    ]);
    expect(body.data.overall).toBe('ok');
    const byName = Object.fromEntries(body.data.checks.map((c) => [c.check, c.detail]));
    expect(typeof byName.database?.latencyMs).toBe('number');
    expect(byName.llm).toMatchObject({ provider: 'mock' });
    expect(byName.policy).toMatchObject({ activeVersion: 1 });
    expect(byName.jobs).toMatchObject({ queued: 0, stuck: 0 });
    expect(byName.aiUsage).toMatchObject({ runs24h: 0 });
  });

  it('[OPS-1] a missing policy and a job stuck past its lease turn the page red', async () => {
    await getDb().job.create({
      data: {
        type: 'analyze',
        payload: {},
        dedupeKey: 'status-test-stuck',
        status: 'running',
        lockedUntil: new Date(Date.now() - 60_000),
      },
    });
    const res = await status(new Request('http://localhost:3000/api/status'));
    const body = (await res.json()) as {
      data: { overall: string; checks: Array<{ check: string; state: string; detail: Record<string, unknown> }> };
    };
    const byName = Object.fromEntries(body.data.checks.map((c) => [c.check, c]));
    expect(byName.policy).toMatchObject({ state: 'fail', detail: { reason: 'no active policy' } });
    expect(byName.jobs).toMatchObject({ state: 'fail', detail: { stuck: 1 } });
    expect(body.data.overall).toBe('fail');
  });
});
