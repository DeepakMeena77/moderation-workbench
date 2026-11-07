import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiUsageState,
  checkDatabase,
  describeAiError,
  getHealth,
  getStatusReport,
  jobsState,
  JOB_QUEUE_WARN_S,
  llmState,
} from '@/server/services/status';

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

  it('[INFRA] with the database down, only app and database are reported and the page is fail', async () => {
    const down = await getStatusReport(async () => {
      throw new Error('down');
    });
    expect(down.overall).toBe('fail');
    expect(down.checks.map((c) => c.check)).toEqual(['app', 'database']);
  });

  it('[OPS-1] a check whose query throws is reported as failing instead of breaking the page', async () => {
    // The mocked client has no aiRun, job or policy tables, so every query-backed check throws.
    const up = await getStatusReport(async () => 1);
    expect(up.checks.map((c) => c.check)).toEqual(['app', 'database', 'llm', 'jobs', 'policy', 'aiUsage']);
    expect(up.checks.find((c) => c.check === 'app')?.detail).toMatchObject({ release: 'local' });
    for (const name of ['llm', 'jobs', 'policy', 'aiUsage']) {
      expect(up.checks.find((c) => c.check === name)).toMatchObject({
        state: 'fail',
        detail: { reason: 'check could not run' },
      });
    }
    expect(up.overall).toBe('fail');
  });
});

describe('status state rules', () => {
  const base = {
    provider: 'gemini' as const,
    hasKey: true,
    production: true,
    lastThreeStatuses: ['ok'],
    callsToday: 0,
    maxCallsPerDay: 200,
  };

  it('[OPS-1] the AI model check fails for mock AI in production and for a missing key', () => {
    expect(llmState({ ...base, provider: 'mock' }).state).toBe('fail');
    expect(llmState({ ...base, provider: 'mock', production: false }).state).toBe('ok');
    expect(llmState({ ...base, hasKey: false })).toEqual({ state: 'fail', reason: 'no Gemini API key' });
  });

  it('[OPS-1] the AI model check warns after 3 failed runs or above 80% of the daily budget', () => {
    expect(llmState({ ...base, lastThreeStatuses: ['timeout', 'rate_limited', 'invalid_output'] }).state).toBe('warn');
    expect(llmState({ ...base, lastThreeStatuses: ['timeout', 'ok', 'invalid_output'] }).state).toBe('ok');
    expect(llmState({ ...base, callsToday: 160 }).state).toBe('warn');
    expect(llmState({ ...base, callsToday: 159 }).state).toBe('ok');
  });

  it('[OPS-1] the jobs check fails on a stuck job and warns on an old queued job', () => {
    expect(jobsState({ stuck: 1, oldestQueuedS: null }).state).toBe('fail');
    expect(jobsState({ stuck: 0, oldestQueuedS: JOB_QUEUE_WARN_S + 1 }).state).toBe('warn');
    expect(jobsState({ stuck: 0, oldestQueuedS: JOB_QUEUE_WARN_S })).toEqual({ state: 'ok', reason: null });
  });

  it('[OPS-1] AI usage warns only when most recent runs fail', () => {
    expect(aiUsageState({ calls: 4, failures: 3 })).toBe('warn');
    expect(aiUsageState({ calls: 3, failures: 3 })).toBe('ok');
    expect(aiUsageState({ calls: 10, failures: 5 })).toBe('ok');
  });

  it('[OPS-1] the last AI error reads as words with its reason, never a bare code', () => {
    expect(describeAiError('invalid_output', 'invalid_after_repair')).toBe('Invalid output (invalid after repair)');
    expect(describeAiError('rate_limited', null)).toBe('Rate limited');
    expect(describeAiError('provider_error', 'http_403')).toBe('Provider error (http 403)');
  });
});
