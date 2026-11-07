import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getCaseRoute } from '@/app/api/cases/[id]/route';
import { POST as reanalyzeRoute } from '@/app/api/cases/[id]/reanalyze/route';
import { POST as reopenRoute } from '@/app/api/cases/[id]/reopen/route';
import { GET as listRoute } from '@/app/api/cases/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import type { CaseDetail, CaseListPage } from '@/server/services/cases';
import { createPost } from '@/server/services/content';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// The queue, the case page and re-analyse / reopen (Q-1, Q-4, HUM-7, SEC-2, SEC-4).

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

interface ErrorBody {
  error: { code: string; message: string };
}

let moderator: User;
let cookie: string;

beforeEach(async () => {
  await installPolicy(1);
  moderator = await createUser('moderator');
  cookie = await sessionCookieFor(moderator.id);
});

async function postAs(author: User, body: string) {
  return createPost(actorFor(author), { body }, 'req-cases-0001');
}

async function list(query = '', as = cookie): Promise<CaseListPage> {
  const res = await listRoute(apiRequest(`/api/cases${query}`, { cookie: as }));
  expect(res.status, await res.clone().text()).toBe(200);
  return (await readJson<{ data: CaseListPage }>(res)).data;
}

async function detail(caseId: string, as = cookie): Promise<CaseDetail> {
  const res = await getCaseRoute(apiRequest(`/api/cases/${caseId}`, { cookie: as }));
  expect(res.status).toBe(200);
  return (await readJson<{ data: CaseDetail }>(res)).data;
}

const post = (path: string, as = cookie) => apiRequest(path, { method: 'POST', cookie: as });

describe('queue', () => {
  it('[Q-1] lists awaiting_review by default, ordered by priority then age, with filters and search', async () => {
    const asha = await createUser('author');
    const ben = await createUser('author');
    const insult = await postAs(asha, 'You are a worthless idiot [mock:invalid]');
    const threat = await postAs(ben, "I'm going to hurt you [mock:invalid]");
    const spam = await postAs(asha, 'Visit http://a.example http://b.example http://c.example now [mock:invalid]');
    await postAs(ben, 'A lovely day at the lake [mock:invalid]');
    await runPendingJobs();

    const page = await list();
    // Threat (alwaysEscalate) 100, insult 55, spam 30, clean 15: all need a human while the AI is unavailable.
    expect(page.items.map((row) => row.id).slice(0, 3)).toEqual([threat.caseId, insult.caseId, spam.caseId]);
    expect(page.total).toBe(4);
    expect(page.items[0]).toMatchObject({
      status: 'awaiting_review',
      priority: 100,
      content: { authorName: ben.name, type: 'post' },
      analysis: { seq: 1, policyVersion: 1, aiStatus: 'invalid_output', action: 'remove', clauseCodes: ['THR-1'] },
    });

    expect((await list('?severity=high')).items.map((r) => r.id)).toEqual([threat.caseId]);
    expect((await list('?q=har-1')).items.map((r) => r.id)).toEqual([insult.caseId]);
    expect((await list('?q=LAKE')).items).toHaveLength(1);
    expect((await list(`?q=${encodeURIComponent(asha.name)}`)).items.map((r) => r.id).sort()).toEqual(
      [insult.caseId, spam.caseId].sort(),
    );
    expect((await list('?ai=unavailable&policy=1')).total).toBe(4);
    expect((await list('?ai=ok')).total).toBe(0);
    expect((await list('?policy=2')).total).toBe(0);
    expect((await list('?status=pending_analysis')).total).toBe(0);
    expect((await list('?trigger=report')).total).toBe(0);
  });

  it('[Q-1] pages with a cursor and never repeats a row', async () => {
    const author = await createUser('author');
    for (let i = 0; i < 5; i++) await postAs(author, `Plain post number ${i} about gardening [mock:invalid]`);
    await runPendingJobs();
    const first = await list('?limit=2');
    const second = await list(`?limit=2&cursor=${first.nextCursor}`);
    const third = await list(`?limit=2&cursor=${second.nextCursor}`);
    const ids = [...first.items, ...second.items, ...third.items].map((r) => r.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    expect(first.total).toBe(5);
  });

  it('[Q-1] rejects an unknown filter value with 400', async () => {
    const res = await listRoute(apiRequest('/api/cases?status=resolved_by_ai', { cookie }));
    expect(res.status).toBe(400);
  });

  it('[SEC-2] authors cannot read the queue or a case', async () => {
    const author = await createUser('author');
    const created = await postAs(author, 'Mine');
    const authorCookie = await sessionCookieFor(author.id);
    expect((await listRoute(apiRequest('/api/cases', { cookie: authorCookie }))).status).toBe(403);
    expect((await getCaseRoute(apiRequest(`/api/cases/${created.caseId}`, { cookie: authorCookie }))).status).toBe(403);
  });
});

describe('case detail', () => {
  it('[DET-5] shows rule findings and the recommendation when the AI result is missing', async () => {
    const author = await createUser('author');
    const reporter = await createUser('author');
    const created = await postAs(author, 'You are a worthless idiot [mock:invalid]');
    await getDb().report.create({ data: { contentId: created.id, reporterId: reporter.id, reason: 'harassment' } });
    await runPendingJobs();
    const data = await detail(created.caseId);
    expect(data.analysis).toMatchObject({
      seq: 1,
      policyVersion: 1,
      ai: null,
      recommendation: { action: 'label', needsHuman: true },
    });
    expect(data.analysis?.aiStatus).not.toBe('ok');
    expect(data.analysis?.aiRun).toMatchObject({ status: 'invalid_output' });
    expect(data.analysis?.ruleFindings[0]).toMatchObject({
      source: 'rule',
      clauseCode: 'HAR-1',
      evidenceType: 'confirmed',
      quotes: [
        { text: 'worthless', start: 10, end: 19 },
        { text: 'idiot', start: 20, end: 25 },
      ],
    });
    expect(data.policy?.clauses.map((c) => c.code)).toContain('HAR-1');
    expect(data.reportReasons).toEqual([{ reason: 'harassment', count: 1 }]);
    // CNT-3e: no reporter identity in the case payload.
    expect(JSON.stringify(data)).not.toContain(reporter.id);
    expect(data.permissions).toEqual({ canDecide: true, canReanalyze: true, canReopen: false, readOnly: false });
  });

  it('[HUM-7] an admin opens the case read-only', async () => {
    const author = await createUser('author');
    const admin = await createUser('admin');
    const created = await postAs(author, 'You are a worthless idiot');
    await runPendingJobs();
    const data = await detail(created.caseId, await sessionCookieFor(admin.id));
    expect(data.permissions).toEqual({ canDecide: false, canReanalyze: false, canReopen: false, readOnly: true });
    expect(
      (await reanalyzeRoute(post(`/api/cases/${created.caseId}/reanalyze`, await sessionCookieFor(admin.id)))).status,
    ).toBe(403);
  });

  it('[Q-1] an unknown case is 404', async () => {
    const res = await getCaseRoute(apiRequest('/api/cases/does-not-exist', { cookie }));
    expect(res.status).toBe(404);
  });
});

describe('re-analyse and reopen', () => {
  it('[Q-4] re-analyse creates a new analysis version and keeps the old one', async () => {
    const author = await createUser('author');
    const created = await postAs(author, 'You are a worthless idiot');
    await runPendingJobs();
    const res = await reanalyzeRoute(post(`/api/cases/${created.caseId}/reanalyze`));
    expect(res.status).toBe(200);
    expect((await detail(created.caseId)).analysisPending).toBe(true);
    await runPendingJobs();
    const data = await detail(created.caseId);
    expect(data.analysisPending).toBe(false);
    expect(data.analysis).toMatchObject({ seq: 2, reason: 'reanalyze' });
    expect(data.versions.map((v) => v.seq)).toEqual([2, 1]);
    const event = await getDb().auditEvent.findFirstOrThrow({ where: { action: 'analysis.requested' } });
    expect(event).toMatchObject({ actorType: 'human', actorId: moderator.id, entityId: created.caseId });
  });

  it('[SEC-4] re-analyse is limited to 10 per minute per moderator, with a clear 429', async () => {
    const author = await createUser('author');
    const created = await postAs(author, 'You are a worthless idiot');
    await runPendingJobs();
    for (let i = 0; i < 10; i++) {
      expect((await reanalyzeRoute(post(`/api/cases/${created.caseId}/reanalyze`))).status).toBe(200);
    }
    const limited = await reanalyzeRoute(post(`/api/cases/${created.caseId}/reanalyze`));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect((await readJson<ErrorBody>(limited)).error.message).toMatch(/^You're re-analysing quickly\. Try again in/);
  });

  it('[Q-4] a moderator reopens an auto-cleared case into awaiting_review, audited', async () => {
    const author = await createUser('author');
    const created = await postAs(author, 'A lovely day at the lake');
    await runPendingJobs();
    // Auto-clear needs a successful AI run (S3); the status is set directly to stand in for it.
    await getDb().case.update({ where: { id: created.caseId }, data: { status: 'auto_cleared' } });

    const blocked = await reanalyzeRoute(post(`/api/cases/${created.caseId}/reanalyze`));
    expect(blocked.status).toBe(409);
    expect((await readJson<ErrorBody>(blocked)).error.code).toBe('INVALID_TRANSITION');
    expect((await detail(created.caseId)).permissions.canReopen).toBe(true);

    const res = await reopenRoute(post(`/api/cases/${created.caseId}/reopen`));
    expect(res.status).toBe(200);
    const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
    expect(kase).toMatchObject({ status: 'awaiting_review', trigger: 'reopen' });
    const event = await getDb().auditEvent.findFirstOrThrow({
      where: { action: 'case.reopened', entityId: created.caseId },
    });
    expect(event).toMatchObject({ actorType: 'human', before: { status: 'auto_cleared' } });
    // Reopening never touches visibility (AI-7, HUM-1).
    expect((await getDb().content.findUniqueOrThrow({ where: { id: created.id } })).visibility).toBe('visible');

    const again = await reopenRoute(post(`/api/cases/${created.caseId}/reopen`));
    expect(again.status).toBe(409);
  });
});
