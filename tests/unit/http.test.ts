import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/server/errors';
import { handle, MAX_BODY_BYTES } from '@/server/http';
import { getLogger } from '@/server/logger';

const ORIGIN = 'http://localhost:3000';
const URL_ = `${ORIGIN}/api/test`;

const echo = handle({ route: 'POST /api/test', body: z.object({ name: z.string().min(1) }) }, async ({ body }) => ({
  hello: body.name,
}));
const plainGet = handle({ route: 'GET /api/test' }, async () => ({ ok: true }));
const plainPost = handle({ route: 'POST /api/plain' }, async () => ({ ok: true }));

function post(init: { headers?: Record<string, string>; body?: string } = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body ?? JSON.stringify({ name: 'Asha' }),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// Route logging goes through a per-request child logger; return the shared logger so spies see the calls.
function routeLogsToSharedLogger() {
  const logger = getLogger();
  return vi.spyOn(logger, 'child').mockReturnValue(logger as unknown as ReturnType<typeof logger.child>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('http wrapper: CSRF origin check', () => {
  it('[SEC-5] rejects a mutation from another origin with 403 FORBIDDEN', async () => {
    const res = await echo(post({ headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toMatchObject({ code: 'FORBIDDEN' });
    expect((body.error as { requestId: string }).requestId).toBe(res.headers.get('x-request-id'));
  });

  it('[SEC-5] rejects a mutation with neither Origin nor Sec-Fetch-Site', async () => {
    const res = await echo(post());
    expect(res.status).toBe(403);
  });

  it('[SEC-5] rejects a mutation whose Sec-Fetch-Site is cross-site', async () => {
    const res = await echo(post({ headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(res.status).toBe(403);
  });

  it('[SEC-5] accepts a mutation whose Origin matches the app', async () => {
    const res = await echo(post({ headers: { origin: ORIGIN } }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { hello: 'Asha' } });
  });

  it('[SEC-5] accepts a mutation with Sec-Fetch-Site same-origin and no Origin', async () => {
    const res = await echo(post({ headers: { 'sec-fetch-site': 'same-origin' } }));
    expect(res.status).toBe(200);
  });

  it('[SEC-5] accepts the public origin behind a proxy (x-forwarded-host)', async () => {
    const res = await echo(
      post({
        headers: {
          origin: 'https://workbench.example',
          'x-forwarded-host': 'workbench.example',
          'x-forwarded-proto': 'https',
        },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('[SEC-5] does not check the origin of safe GET requests', async () => {
    const res = await plainGet(new Request(URL_, { headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(200);
  });
});

describe('http wrapper: body limits and validation', () => {
  it('[SEC-3] rejects a body larger than 100 kB with 413 PAYLOAD_TOO_LARGE', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(MAX_BODY_BYTES) });
    const res = await echo(post({ headers: { origin: ORIGIN }, body: big }));
    expect(res.status).toBe(413);
    expect((await json(res)).error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('[SEC-3] rejects an oversized declared Content-Length even without a body schema', async () => {
    const res = await plainPost(
      new Request(`${ORIGIN}/api/plain`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-length': String(MAX_BODY_BYTES + 1) },
        body: 'x'.repeat(MAX_BODY_BYTES + 1),
      }),
    );
    expect(res.status).toBe(413);
  });

  it('[INFRA] invalid JSON gives 400 VALIDATION_FAILED', async () => {
    const res = await echo(post({ headers: { origin: ORIGIN }, body: '{"name":' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('[INFRA] a schema failure gives 400 with the field paths', async () => {
    const res = await echo(post({ headers: { origin: ORIGIN }, body: JSON.stringify({ name: '' }) }));
    expect(res.status).toBe(400);
    const error = (await json(res)).error as { code: string; details: Array<{ path: string }> };
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details.map((d) => d.path)).toEqual(['name']);
  });
});

describe('http wrapper: errors, request IDs and logging', () => {
  it('[INFRA] maps an AppError to its status and the error envelope', async () => {
    const route = handle({ route: 'GET /api/conflict' }, async () => {
      throw new AppError('STALE_ANALYSIS', 'This case changed.', { currentAnalysisId: 'a2' });
    });
    const res = await route(new Request(`${ORIGIN}/api/conflict`));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toEqual({
      code: 'STALE_ANALYSIS',
      message: 'This case changed.',
      details: { currentAnalysisId: 'a2' },
      requestId: res.headers.get('x-request-id'),
    });
  });

  it('[INFRA] an unexpected error gives 500 INTERNAL without leaking its message, and is logged', async () => {
    const childSpy = routeLogsToSharedLogger();
    const logged = vi.spyOn(getLogger(), 'error');
    const route = handle({ route: 'GET /api/boom' }, async () => {
      throw new Error('connection to db-host-internal failed');
    });
    const res = await route(new Request(`${ORIGIN}/api/boom`));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('INTERNAL');
    expect(text).not.toContain('db-host-internal');
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ event: 'http.error', route: 'GET /api/boom' }));
    expect(childSpy).toHaveBeenCalledWith({ requestId: res.headers.get('x-request-id') });
  });

  it('[INFRA] reuses a well-formed incoming x-request-id and replaces a malformed one', async () => {
    const reused = await plainGet(new Request(URL_, { headers: { 'x-request-id': 'req-abc-12345' } }));
    expect(reused.headers.get('x-request-id')).toBe('req-abc-12345');
    const replaced = await plainGet(new Request(URL_, { headers: { 'x-request-id': 'bad id with spaces' } }));
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('[SEC-5] logs http.request with method, route, status, duration and request ID, never the body', async () => {
    routeLogsToSharedLogger();
    const info = vi.spyOn(getLogger(), 'info');
    const res = await echo(post({ headers: { origin: ORIGIN }, body: JSON.stringify({ name: 'secret-body-text' }) }));
    expect(res.status).toBe(200);
    const call = info.mock.calls.find(([entry]) => (entry as { event?: string }).event === 'http.request');
    expect(call).toBeDefined();
    const entry = call?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({ method: 'POST', route: 'POST /api/test', status: 200 });
    expect(typeof entry.durationMs).toBe('number');
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret-body-text');
  });
});
