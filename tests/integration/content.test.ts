import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as report } from '@/app/api/content/[id]/reports/route';
import { POST as comment } from '@/app/api/posts/[id]/comments/route';
import { GET as feed, POST as post } from '@/app/api/posts/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { loadAnalysisContext } from '@/server/services/analysis';
import type { FeedPage } from '@/server/services/content';
import { installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// Posts, comments, reports and the feed through their routes (CNT-1..3, CNT-5, SEC-4, AUD-1).

// after() only exists inside a Next.js request; here it collects the callbacks so a test can check that
// work was kicked and run it.
const scheduled = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => {
    scheduled.push(callback);
  },
}));

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}
interface Created {
  data: { id: string; caseId: string; policyVersion: number | null };
}

async function as(role: 'author' | 'moderator' | 'admin') {
  const user = await createUser(role);
  return { user, cookie: await sessionCookieFor(user.id) };
}

async function createPostAs(cookie: string, body = 'Hello community, first post here.') {
  const res = await post(apiRequest('/api/posts', { method: 'POST', cookie, body: { body } }));
  expect(res.status, await res.clone().text()).toBe(200);
  return (await readJson<Created>(res)).data;
}

async function feedFor(cookie: string): Promise<FeedPage> {
  const res = await feed(apiRequest('/api/posts', { cookie }));
  expect(res.status).toBe(200);
  return (await readJson<{ data: FeedPage }>(res)).data;
}

async function counts() {
  const db = getDb();
  const [content, cases, jobs, audit] = await Promise.all([
    db.content.count(),
    db.case.count(),
    db.job.count(),
    db.auditEvent.count(),
  ]);
  return { content, cases, jobs, audit };
}

beforeEach(async () => {
  scheduled.length = 0;
  await installPolicy(1);
});

afterEach(() => {
  scheduled.length = 0;
});

describe('posts', () => {
  it('[CNT-1] a post appears in the feed at once, opens a pending_analysis case and queues an analyse job', async () => {
    const author = await as('author');
    const other = await as('author');
    const created = await createPostAs(author.cookie, '  Hello community, first post here.  ');
    expect(created.policyVersion).toBe(1);

    const otherFeed = await feedFor(other.cookie);
    expect(otherFeed.items.map((i) => i.id)).toEqual([created.id]);
    expect(otherFeed.items[0]).toMatchObject({
      body: 'Hello community, first post here.',
      isOwn: false,
      analysing: false,
    });
    expect((await feedFor(author.cookie)).items[0]).toMatchObject({ isOwn: true, analysing: true });

    const db = getDb();
    const kase = await db.case.findUniqueOrThrow({ where: { contentId: created.id } });
    expect(kase).toMatchObject({ id: created.caseId, status: 'pending_analysis', trigger: 'new_content' });
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({
      type: 'analyze',
      status: 'queued',
      payload: { caseId: kase.id, reason: 'initial' },
      dedupeKey: `analyze:${kase.id}:initial:1:${created.id}`,
    });
  });

  it('[CNT-1] empty, blank and too-long text is rejected with the field message and nothing is saved', async () => {
    const author = await as('author');
    const cases: Array<[unknown, string]> = [
      ['', 'Write at least 1 character.'],
      ['   \n ', 'Write at least 1 character.'],
      ['x'.repeat(2001), 'Keep it under 2,000 characters (2,001).'],
      [undefined, 'Write at least 1 character.'],
    ];
    for (const [body, message] of cases) {
      const res = await post(apiRequest('/api/posts', { method: 'POST', cookie: author.cookie, body: { body } }));
      expect(res.status).toBe(400);
      const { error } = await readJson<ErrorBody>(res);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([{ path: 'body', message }]);
    }
    expect(await counts()).toEqual({ content: 0, cases: 0, jobs: 0, audit: 0 });
  });

  it('[CNT-1] exactly 2,000 characters is accepted', async () => {
    const author = await as('author');
    await createPostAs(author.cookie, 'y'.repeat(2000));
    expect((await counts()).content).toBe(1);
  });

  it('[CNT-1] only authors post; staff get 403', async () => {
    const moderator = await as('moderator');
    const res = await post(
      apiRequest('/api/posts', { method: 'POST', cookie: moderator.cookie, body: { body: 'Hi' } }),
    );
    expect(res.status).toBe(403);
  });

  it('[AUD-1] content, case, job and their audit events are written in one transaction', async () => {
    const author = await as('author');
    const res = await post(
      apiRequest('/api/posts', {
        method: 'POST',
        cookie: author.cookie,
        body: { body: 'Audited post' },
        headers: { 'x-request-id': 'req-audit-0001' },
      }),
    );
    const created = (await readJson<Created>(res)).data;
    const events = await getDb().auditEvent.findMany({ orderBy: { id: 'asc' } });
    expect(
      events.map((e) => [e.action, e.entityType, e.entityId, e.actorType, e.actorId, e.requestId, e.policyVersion]),
    ).toEqual([
      ['content.created', 'content', created.id, 'human', author.user.id, 'req-audit-0001', 1],
      ['case.opened', 'case', created.caseId, 'human', author.user.id, 'req-audit-0001', 1],
    ]);
    // The audit row never holds the content text (SEC-5), only its length.
    expect(JSON.stringify(events.map((e) => e.after))).not.toContain('Audited post');
  });

  it('[AUD-1] if the audit insert fails, the content, case and job are rolled back too', async () => {
    const author = await as('author');
    const db = getDb();
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION test_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit down'; END $$ LANGUAGE plpgsql`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_fail_audit()`,
    );
    try {
      const res = await post(
        apiRequest('/api/posts', { method: 'POST', cookie: author.cookie, body: { body: 'Lost' } }),
      );
      expect(res.status).toBe(500);
      expect(await counts()).toEqual({ content: 0, cases: 0, jobs: 0, audit: 0 });
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_audit ON "AuditEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_audit()`);
    }
  });

  it('[OPS-4] posting and reading the feed kick the job runner after the response', async () => {
    const author = await as('author');
    await createPostAs(author.cookie);
    expect(scheduled).toHaveLength(1);
    await feedFor(author.cookie);
    expect(scheduled).toHaveLength(2);
    for (const callback of scheduled.splice(0)) await callback();
    const analysis = await getDb().analysis.findFirstOrThrow();
    expect(analysis.seq).toBe(1);
  });
});

describe('rate limit', () => {
  it('[SEC-4] the 11th post or comment within a minute gets 429 with a clear message and Retry-After', async () => {
    const author = await as('author');
    const first = await createPostAs(author.cookie, 'post 0');
    for (let i = 1; i < 9; i++) await createPostAs(author.cookie, `post ${i}`);
    const tenth = await comment(
      apiRequest(`/api/posts/${first.id}/comments`, { method: 'POST', cookie: author.cookie, body: { body: 'c' } }),
    );
    expect(tenth.status).toBe(200);

    const res = await post(
      apiRequest('/api/posts', { method: 'POST', cookie: author.cookie, body: { body: 'one more' } }),
    );
    expect(res.status).toBe(429);
    const { error } = await readJson<ErrorBody>(res);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toMatch(/^You're posting quickly\. Try again in \d+ seconds?\.$/);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await counts()).content).toBe(10);
  });
});

describe('comments', () => {
  it('[CNT-2] an author comments on a post; the comment gets its own case and job, and is analysed with its parent', async () => {
    const author = await as('author');
    const other = await as('author');
    const parent = await createPostAs(author.cookie, 'Parent post about the lake');
    const res = await comment(
      apiRequest(`/api/posts/${parent.id}/comments`, {
        method: 'POST',
        cookie: other.cookie,
        body: { body: 'Nice one' },
      }),
    );
    expect(res.status).toBe(200);
    const created = (await readJson<Created>(res)).data;

    const row = await getDb().content.findUniqueOrThrow({ where: { id: created.id }, include: { case: true } });
    expect(row).toMatchObject({ type: 'comment', parentId: parent.id, body: 'Nice one' });
    expect(row.case?.status).toBe('pending_analysis');

    const ctx = await getDb().$transaction((tx) => loadAnalysisContext(tx, created.caseId));
    expect(ctx?.parent).toEqual({ id: parent.id, body: 'Parent post about the lake' });

    const items = (await feedFor(author.cookie)).items;
    expect(items[0]?.comments.map((c) => c.body)).toEqual(['Nice one']);
  });

  it('[CNT-2] comments have the same validation, and need an existing post', async () => {
    const author = await as('author');
    const parent = await createPostAs(author.cookie);
    const empty = await comment(
      apiRequest(`/api/posts/${parent.id}/comments`, { method: 'POST', cookie: author.cookie, body: { body: ' ' } }),
    );
    expect(empty.status).toBe(400);
    const missing = await comment(
      apiRequest('/api/posts/cnosuchpost000/comments', { method: 'POST', cookie: author.cookie, body: { body: 'Hi' } }),
    );
    expect(missing.status).toBe(404);
    expect((await counts()).content).toBe(1);
  });
});

describe('reports', () => {
  async function reportAs(cookie: string, contentId: string, body: unknown = { reason: 'harassment' }) {
    return report(apiRequest(`/api/content/${contentId}/reports`, { method: 'POST', cookie, body }));
  }

  it('[CNT-3] a report joins the open case, raises its priority and queues a re-analysis', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie);
    const res = await reportAs(reporter.cookie, created.id, { reason: 'spam', note: '  links everywhere ' });
    expect(res.status).toBe(200);

    const db = getDb();
    const kase = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(kase).toMatchObject({ status: 'pending_analysis', reportCount: 1 });
    expect(kase.priority).toBeGreaterThan(0);
    const stored = await db.report.findFirstOrThrow();
    expect(stored).toMatchObject({ reason: 'spam', note: 'links everywhere', reporterId: reporter.user.id });
    const jobs = await db.job.findMany({ orderBy: { createdAt: 'asc' } });
    expect(jobs.map((j) => (j.payload as { reason: string }).reason)).toEqual(['initial', 'report']);
    expect(await db.auditEvent.count({ where: { action: 'report.created', entityId: stored.id } })).toBe(1);

    const second = await as('author');
    await reportAs(second.cookie, created.id);
    const raised = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(raised.reportCount).toBe(2);
    expect(raised.priority).toBeGreaterThan(kase.priority);
  });

  it('[CNT-3] a second report by the same user is a 409 ALREADY_REPORTED', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie);
    expect((await reportAs(reporter.cookie, created.id)).status).toBe(200);
    const again = await reportAs(reporter.cookie, created.id, { reason: 'other' });
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error).toMatchObject({
      code: 'ALREADY_REPORTED',
      message: "You've already reported this.",
    });
    expect(await getDb().report.count()).toBe(1);
  });

  it('[CNT-3] a user cannot report their own content', async () => {
    const author = await as('author');
    const created = await createPostAs(author.cookie);
    const res = await reportAs(author.cookie, created.id);
    expect(res.status).toBe(403);
    expect((await readJson<ErrorBody>(res)).error.message).toBe("You can't report your own content.");
    expect(await getDb().report.count()).toBe(0);
  });

  it('[CNT-3] the reason must be one of the list and the note at most 500 characters', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie);
    const badReason = await reportAs(reporter.cookie, created.id, { reason: 'rude' });
    expect(badReason.status).toBe(400);
    expect((await readJson<ErrorBody>(badReason)).error.details).toEqual([
      { path: 'reason', message: 'Choose a reason.' },
    ]);
    expect((await reportAs(reporter.cookie, created.id, { reason: 'other', note: 'n'.repeat(501) })).status).toBe(400);
    expect((await reportAs(reporter.cookie, 'cnosuchcontent0')).status).toBe(404);
    expect(await getDb().report.count()).toBe(0);
  });

  it('[CNT-3] a report on an auto_cleared case moves it to awaiting_review, audited', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie);
    const db = getDb();
    await db.case.update({ where: { id: created.caseId }, data: { status: 'auto_cleared' } });
    await reportAs(reporter.cookie, created.id);
    expect((await db.case.findUniqueOrThrow({ where: { id: created.caseId } })).status).toBe('awaiting_review');
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'case.reopened' } });
    expect(event).toMatchObject({ before: { status: 'auto_cleared' }, after: { status: 'awaiting_review' } });
  });

  it('[CNT-3] a report on a resolved case reopens it as pending_analysis and adds an analysis with reason report', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie, 'You are a worthless idiot');
    await runPendingJobs();
    const db = getDb();
    await db.case.update({ where: { id: created.caseId }, data: { status: 'resolved' } });

    await reportAs(reporter.cookie, created.id);
    expect(await db.case.findUniqueOrThrow({ where: { id: created.caseId } })).toMatchObject({
      status: 'pending_analysis',
      trigger: 'report',
    });
    await runPendingJobs();
    const analyses = await db.analysis.findMany({ where: { caseId: created.caseId }, orderBy: { seq: 'asc' } });
    expect(analyses.map((a) => [a.seq, a.reason])).toEqual([
      [1, 'initial'],
      [2, 'report'],
    ]);
    const kase = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(kase).toMatchObject({ status: 'awaiting_review', currentAnalysisId: analyses[1]?.id });
  });

  it('[CNT-3] the author never sees who reported their content', async () => {
    const author = await as('author');
    const reporter = await as('author');
    const created = await createPostAs(author.cookie);
    await reportAs(reporter.cookie, created.id, { reason: 'other', note: 'secret reporter note' });
    const res = await feed(apiRequest('/api/posts', { cookie: author.cookie }));
    const text = await res.text();
    expect(text).not.toContain(reporter.user.id);
    expect(text).not.toContain(reporter.user.name);
    expect(text).not.toContain('secret reporter note');
    const reporterFeed = await feedFor(reporter.cookie);
    expect(reporterFeed.items[0]?.viewerReported).toBe(true);
  });
});

describe('feed visibility', () => {
  it('[CNT-5] a removed post is hidden from other authors but shown to its author and to staff', async () => {
    const author = await as('author');
    const other = await as('author');
    const moderator = await as('moderator');
    const kept = await createPostAs(author.cookie, 'kept');
    const removed = await createPostAs(author.cookie, 'removed one');
    const labeled = await createPostAs(author.cookie, 'labeled one');
    // Test fixture: the app has no visibility writer until S4 (decisions); the database is set directly.
    const db = getDb();
    await db.content.update({ where: { id: removed.id }, data: { visibility: 'removed' } });
    await db.content.update({ where: { id: labeled.id }, data: { visibility: 'labeled' } });

    expect((await feedFor(other.cookie)).items.map((i) => i.id).sort()).toEqual([kept.id, labeled.id].sort());
    const own = await feedFor(author.cookie);
    expect(own.items.find((i) => i.id === removed.id)?.visibility).toBe('removed');
    expect((await feedFor(moderator.cookie)).items).toHaveLength(3);
    expect((await feedFor(other.cookie)).items.find((i) => i.id === labeled.id)?.visibility).toBe('labeled');

    const hiddenReport = await report(
      apiRequest(`/api/content/${removed.id}/reports`, {
        method: 'POST',
        cookie: other.cookie,
        body: { reason: 'spam' },
      }),
    );
    expect(hiddenReport.status).toBe(404);
  });

  it('[CNT-5] the feed pages with a cursor, newest first', async () => {
    const author = await as('author');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await createPostAs(author.cookie, `post ${i}`)).id);
    const first = await readJson<{ data: FeedPage }>(
      await feed(apiRequest('/api/posts?limit=2', { cookie: author.cookie })),
    );
    expect(first.data.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    const second = await readJson<{ data: FeedPage }>(
      await feed(apiRequest(`/api/posts?limit=2&cursor=${first.data.nextCursor}`, { cookie: author.cookie })),
    );
    expect(second.data.items.map((i) => i.id)).toEqual([ids[0]]);
    expect(second.data.nextCursor).toBeNull();
  });
});
