import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listRoute } from '@/app/api/audit/route';
import { GET as verifyRoute } from '@/app/api/audit/verify/route';
import { getDb } from '@/server/db';
import { AppError } from '@/server/errors';
import { handle } from '@/server/http';
import { runAnalyzeJob } from '@/server/jobs/handlers';
import { getLogger } from '@/server/logger';
import { append, canonicalJson, GENESIS_HASH, verifyChain, type AuditEventInput } from '@/server/services/audit';
import { createPost } from '@/server/services/content';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// AUD-2: insert-only tables. A database trigger (forbid_mutation) rejects UPDATE and DELETE (Analysis, AiRun and
// AuditEvent here; Decision in decisions.test.ts). AUD-3..5 and OPS-3 (S7) follow below.

const REJECTED = /insert-only table/;

async function analysedCase() {
  const author = await createUser('author');
  const created = await createPost(actorFor(author), { body: 'You are a worthless idiot' }, 'req-audit-0001');
  await runAnalyzeJob({ caseId: created.caseId, reason: 'initial' });
  const db = getDb();
  return { analysis: await db.analysis.findFirstOrThrow(), run: await db.aiRun.findFirstOrThrow() };
}

beforeEach(async () => {
  await installPolicy(1);
});

describe('insert-only tables (AUD-2)', () => {
  it('[AUD-2] UPDATE and DELETE on Analysis are rejected by the database', async () => {
    const { analysis } = await analysedCase();
    const db = getDb();
    await expect(db.analysis.update({ where: { id: analysis.id }, data: { reason: 'tampered' } })).rejects.toThrow(
      REJECTED,
    );
    await expect(db.analysis.delete({ where: { id: analysis.id } })).rejects.toThrow(REJECTED);
    await expect(db.$executeRaw`UPDATE "Analysis" SET "seq" = 99 WHERE "id" = ${analysis.id}`).rejects.toThrow(
      REJECTED,
    );
    expect(await db.analysis.findUniqueOrThrow({ where: { id: analysis.id } })).toMatchObject({
      seq: 1,
      reason: 'initial',
    });
  });

  it('[AUD-2] UPDATE and DELETE on AiRun are rejected by the database', async () => {
    const { run } = await analysedCase();
    const db = getDb();
    await expect(db.aiRun.update({ where: { id: run.id }, data: { status: 'ok', costUsd: 0 } })).rejects.toThrow(
      REJECTED,
    );
    await expect(db.aiRun.delete({ where: { id: run.id } })).rejects.toThrow(REJECTED);
    await expect(db.$executeRaw`DELETE FROM "AiRun" WHERE "id" = ${run.id}`).rejects.toThrow(REJECTED);
    expect(await db.aiRun.count()).toBe(1);
  });

  it('[AUD-2] inserting more analyses is still allowed (re-analysis adds seq + 1)', async () => {
    const { analysis } = await analysedCase();
    await runAnalyzeJob({ caseId: analysis.caseId, reason: 'reanalyze' });
    expect(await getDb().analysis.count()).toBe(2);
  });
});

// --- S7: the hash chain (AUD-3), denied access (AUD-4), the audit list (AUD-5) ---

type Db = ReturnType<typeof getDb>;
type TxClient = Parameters<Parameters<Db['$transaction']>[0]>[0];

/** Appends one event in its own transaction, as a service would. */
async function appendEvent(input: Partial<AuditEventInput> = {}) {
  await getDb().$transaction((tx) =>
    append(tx, {
      actorId: null,
      actorType: 'system',
      action: 'job.failed',
      entityType: 'job',
      entityId: 'job-1',
      after: { attempts: 3 },
      requestId: null,
      ...input,
    }),
  );
}

const eventIds = async () =>
  (await getDb().auditEvent.findMany({ orderBy: { id: 'asc' }, select: { id: true } })).map((e) => e.id);

/**
 * The privileged test path (05 sec. 5): only the table owner may disable the insert-only trigger. It is disabled
 * and re-enabled inside one transaction, so no other session ever sees the table unprotected.
 */
async function tamper(change: (tx: TxClient) => Promise<unknown>) {
  await getDb().$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_insert_only"');
    await change(tx);
    await tx.$executeRawUnsafe('ALTER TABLE "AuditEvent" ENABLE TRIGGER "AuditEvent_insert_only"');
  });
}

describe('audit hash chain (AUD-2, AUD-3)', () => {
  it('[AUD-2] UPDATE and DELETE on AuditEvent are rejected by the database', async () => {
    await appendEvent();
    const db = getDb();
    const event = await db.auditEvent.findFirstOrThrow();
    await expect(db.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } })).rejects.toThrow(
      REJECTED,
    );
    await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(REJECTED);
    await expect(db.$executeRaw`UPDATE "AuditEvent" SET "hash" = 'x' WHERE "id" = ${event.id}`).rejects.toThrow(
      REJECTED,
    );
    expect(await db.auditEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      action: 'job.failed',
      hash: event.hash,
    });
  });

  it('[AUD-3] each event links to the previous hash, starting from the genesis hash, and verify is intact', async () => {
    const author = await createUser('author');
    await createPost(actorFor(author), { body: 'A quiet post' }, 'req-audit-0002');
    await appendEvent({ before: { nested: { b: 2, a: [1, 'x'] } } });
    const events = await getDb().auditEvent.findMany({ orderBy: { id: 'asc' } });
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]?.prevHash).toBe(GENESIS_HASH);
    events.forEach((event, i) => {
      expect(event.hash).toMatch(/^[0-9a-f]{64}$/);
      if (i > 0) expect(event.prevHash).toBe(events[i - 1]?.hash);
    });
    expect(await verifyChain()).toEqual({ intact: true, checked: events.length, firstBrokenId: null });
  });

  it('[AUD-3] concurrent appends still form one unbroken chain (advisory lock)', async () => {
    await Promise.all(Array.from({ length: 6 }, (_, i) => appendEvent({ entityId: `job-${i}` })));
    expect(await verifyChain()).toEqual({ intact: true, checked: 6, firstBrokenId: null });
  });

  it('[AUD-3] tampering with one row breaks verify at that ID, through the API too', async () => {
    for (let i = 0; i < 4; i++) await appendEvent({ entityId: `job-${i}` });
    const target = (await eventIds())[2] as bigint;
    await tamper((tx) => tx.$executeRaw`UPDATE "AuditEvent" SET "after" = '{"attempts": 1}' WHERE "id" = ${target}`);

    expect(await verifyChain()).toEqual({ intact: false, checked: 3, firstBrokenId: target.toString() });

    const moderator = await createUser('moderator');
    const res = await verifyRoute(apiRequest('/api/audit/verify', { cookie: await sessionCookieFor(moderator.id) }));
    expect(res.status).toBe(200);
    expect((await readJson<{ data: unknown }>(res)).data).toEqual({
      intact: false,
      checked: 3,
      firstBrokenId: target.toString(),
    });
  });

  it('[AUD-3] rewriting a row together with its own hash is caught at the next row; a deleted row too', async () => {
    for (let i = 0; i < 4; i++) await appendEvent({ entityId: `job-${i}` });
    const [, second, third, fourth] = await eventIds();
    // Change the content, then give the row the hash that matches its new content (audit_event_hash is the SQL
    // twin of the app's hash): the row itself checks out, but the next row's prevHash no longer does.
    await tamper(async (tx) => {
      await tx.$executeRaw`UPDATE "AuditEvent" SET "after" = '{"attempts": 9}' WHERE "id" = ${second}`;
      await tx.$executeRaw`UPDATE "AuditEvent" e SET "hash" = audit_event_hash(e."prevHash", e) WHERE e."id" = ${second}`;
    });
    expect((await verifyChain()).firstBrokenId).toBe(third?.toString());

    await tamper((tx) => tx.$executeRaw`DELETE FROM "AuditEvent" WHERE "id" IN (${second}, ${third})`);
    expect(await verifyChain()).toEqual({ intact: false, checked: 2, firstBrokenId: fourth?.toString() });
  });

  it('[AUD-3] the SQL hash that chained the pre-S7 events matches the app hash, for escapes and nesting', async () => {
    await appendEvent({
      actorId: 'user-\u00e9',
      requestId: 'req-audit-0003',
      policyVersion: 2,
      before: { quote: 'a "b" \\ c', ctl: 'line\nnext\ttab\u0001', text: '\u4f60\u597d \ud83d\ude00' },
      after: { list: [3, 1.5, -2, true, false, null, { z: 1, a: { y: [], x: {} } }], zero: 0, big: 123456789 },
    });
    await appendEvent();
    const mismatched = await getDb().$queryRaw<Array<{ id: bigint }>>`
      SELECT e."id" FROM "AuditEvent" e WHERE e."hash" <> audit_event_hash(e."prevHash", e)`;
    expect(mismatched).toEqual([]);
  });

  it('[AUD-3] canonical JSON sorts keys at every level and has no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: null, e: 'x' }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"e":"x","f":null}]},"b":1}',
    );
  });
});

describe('denied access (AUD-4, OPS-3)', () => {
  const staffOnly = handle(
    { route: 'GET /api/test/staff', auth: ['moderator', 'senior_moderator', 'admin'] },
    async () => ({ ok: true }),
  );
  const serviceDenies = handle({ route: 'POST /api/test/resolve', auth: 'signed-in' }, async () => {
    throw new AppError('SAME_REVIEWER', 'Another senior moderator must review this.');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('[AUD-4] a 403 from the role check is written as an access.denied event with the actor and request ID', async () => {
    const author = await createUser('author');
    const res = await staffOnly(
      apiRequest('/api/test/staff', {
        cookie: await sessionCookieFor(author.id),
        headers: { 'x-request-id': 'req-denied-0001' },
      }),
    );
    expect(res.status).toBe(403);
    const events = await getDb().auditEvent.findMany({ where: { action: 'access.denied' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: author.id,
      actorType: 'human',
      entityType: 'route',
      entityId: 'GET /api/test/staff',
      requestId: 'req-denied-0001',
      after: { method: 'GET', code: 'FORBIDDEN', role: 'author' },
    });
    expect((await verifyChain()).intact).toBe(true);
  });

  it('[AUD-4] a 403 from a service rule is recorded with its code', async () => {
    const senior = await createUser('senior_moderator');
    const res = await serviceDenies(
      apiRequest('/api/test/resolve', { method: 'POST', cookie: await sessionCookieFor(senior.id) }),
    );
    expect(res.status).toBe(403);
    const events = await getDb().auditEvent.findMany();
    expect(events.map((e) => [e.action, (e.after as { code?: string } | null)?.code])).toEqual([
      ['access.denied', 'SAME_REVIEWER'],
    ]);
  });

  it('[AUD-4] 401 and cross-site requests have no known actor and leave no event', async () => {
    const author = await createUser('author');
    expect((await staffOnly(apiRequest('/api/test/staff'))).status).toBe(401);
    const crossSite = await serviceDenies(
      apiRequest('/api/test/resolve', {
        method: 'POST',
        cookie: await sessionCookieFor(author.id),
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(crossSite.status).toBe(403);
    expect(await getDb().auditEvent.count()).toBe(0);
  });

  it('[AUD-4] recording is best effort: if the audit write fails, the 403 is unchanged and the failure is logged', async () => {
    const logger = getLogger();
    vi.spyOn(logger, 'child').mockReturnValue(logger as unknown as ReturnType<typeof logger.child>);
    const error = vi.spyOn(logger, 'error');
    const author = await createUser('author');
    const cookie = await sessionCookieFor(author.id);
    // Swapped by hand: vi.spyOn on the Prisma client's $transaction does not restore cleanly.
    const db = getDb();
    const original = db.$transaction.bind(db);
    db.$transaction = (() => Promise.reject(new Error('database went away'))) as unknown as typeof db.$transaction;
    let res: Response;
    try {
      res = await staffOnly(apiRequest('/api/test/staff', { cookie }));
    } finally {
      db.$transaction = original;
    }
    expect(res.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('FORBIDDEN');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit.write_failed', action: 'access.denied', route: 'GET /api/test/staff' }),
    );
    expect(await getDb().auditEvent.count()).toBe(0);
  });

  it('[OPS-3] log lines carry the event name, request ID and user ID', async () => {
    const logger = getLogger();
    const child = vi.spyOn(logger, 'child').mockReturnValue(logger as unknown as ReturnType<typeof logger.child>);
    const info = vi.spyOn(logger, 'info');
    const warn = vi.spyOn(logger, 'warn');
    const author = await createUser('author');
    await staffOnly(
      apiRequest('/api/test/staff', {
        cookie: await sessionCookieFor(author.id),
        headers: { 'x-request-id': 'req-logged-0001' },
      }),
    );
    // The per-request child logger binds the request ID to every line it writes.
    expect(child).toHaveBeenCalledWith({ requestId: 'req-logged-0001' });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'access.denied', userId: author.id }));
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'http.request', route: 'GET /api/test/staff', status: 403, userId: author.id }),
    );
  });
});

describe('GET /api/audit (AUD-5)', () => {
  interface AuditListBody {
    data: {
      items: Array<{ id: string; action: string; actorName: string | null; entityId: string }>;
      nextCursor: string | null;
      total: number;
    };
  }

  async function list(cookie: string, query: string) {
    const res = await listRoute(apiRequest(`/api/audit${query}`, { cookie }));
    return { status: res.status, body: await readJson<AuditListBody>(res) };
  }

  it('[AUD-5] staff filter by actor type, action, entity, date range and search, newest first, with pagination', async () => {
    const moderator = await createUser('moderator');
    const cookie = await sessionCookieFor(moderator.id);
    await appendEvent({ entityId: 'job-a' });
    await appendEvent({ entityId: 'job-b' });
    await appendEvent({
      actorId: moderator.id,
      actorType: 'human',
      action: 'decision.created',
      entityType: 'decision',
      entityId: 'dec-1',
      requestId: 'req-find-me-01',
    });

    const page1 = await list(cookie, '?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.data.total).toBe(3);
    expect(page1.body.data.items.map((i) => i.entityId)).toEqual(['dec-1', 'job-b']);
    expect(page1.body.data.items[0]?.actorName).toBe(moderator.name);
    const page2 = await list(cookie, `?limit=2&cursor=${page1.body.data.nextCursor}`);
    expect(page2.body.data.items.map((i) => i.entityId)).toEqual(['job-a']);
    expect(page2.body.data.nextCursor).toBeNull();

    const ids = (query: string) => list(cookie, query).then((r) => r.body.data.items.map((i) => i.entityId));
    expect(await ids('?actorType=human')).toEqual(['dec-1']);
    expect(await ids('?action=job.failed')).toEqual(['job-b', 'job-a']);
    expect(await ids('?entity=decision')).toEqual(['dec-1']);
    expect(await ids(`?q=${encodeURIComponent(moderator.name)}`)).toEqual(['dec-1']);
    expect(await ids('?q=req-find-me-01')).toEqual(['dec-1']);
    expect(await ids('?q=JOB-A')).toEqual(['job-a']);
    const jobA = page2.body.data.items[0]?.id ?? '';
    expect(await ids(`?q=%23${jobA}`)).toEqual(['job-a']);

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const inAnHour = new Date(Date.now() + 3600_000).toISOString();
    expect((await list(cookie, `?from=${hourAgo}&to=${inAnHour}`)).body.data.total).toBe(3);
    expect((await list(cookie, `?to=${hourAgo}`)).body.data.total).toBe(0);
  });

  it('[AUD-5] authors get 403 and an invalid filter gets 400', async () => {
    const author = await createUser('author');
    expect((await list(await sessionCookieFor(author.id), '')).status).toBe(403);
    const moderator = await createUser('moderator');
    const cookie = await sessionCookieFor(moderator.id);
    expect((await list(cookie, '?from=yesterday&actorType=robot')).status).toBe(400);
    const now = new Date().toISOString();
    expect((await list(cookie, `?from=${now}&to=${now}`)).status).toBe(400);
  });
});
