import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as historyRoute } from '@/app/api/content/[id]/history/route';
import { POST as createAppealRoute } from '@/app/api/decisions/[id]/appeals/route';
import { GET as myContentRoute } from '@/app/api/me/content/route';
import { GET as feedRoute } from '@/app/api/posts/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { createAppeal, resolveAppeal } from '@/server/services/appeals';
import { createPost } from '@/server/services/content';
import { decide } from '@/server/services/decisions';
import { createReport } from '@/server/services/reports';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// The author's side of moderation: My content, the history timeline (author view vs staff view) and the feed's
// appeal deadline (CNT-4, CNT-5, APP-1, APP-5, SEC-2).

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

interface HistoryBody {
  data: {
    view: 'author' | 'staff';
    content: { authorName: string | null };
    events: Array<{ kind: string; title: string; lines: string[]; facts?: Array<{ label: string; value: string }> }>;
    auditEvents?: Array<{ action: string; actorName: string | null }>;
  };
}

interface MyContentBody {
  data: {
    items: Array<{
      id: string;
      visibility: string;
      caseStatus: string | null;
      decision: { finalAction: string; summary: string; clauses: Array<{ code: string; title: string | null }> } | null;
      appeal: { status: string; outcome: string | null; summary: string } | null;
      appealability: { canAppeal: boolean; until: string | null; reason: string | null } | null;
    }>;
    nextCursor: string | null;
  };
}

let author: User;
let decider: User;
let reviewer: User;
let reporter: User;
let authorCookie: string;

beforeEach(async () => {
  await installPolicy(1);
  author = await createUser('author');
  decider = await createUser('senior_moderator');
  reviewer = await createUser('senior_moderator');
  reporter = await getDb().user.update({
    where: { id: (await createUser('author')).id },
    data: { name: 'Rita Reporter' },
  });
  authorCookie = await sessionCookieFor(author.id);
});

/** A post limited under HAR-1 by `decider`, reported once, with the decider's rationale on record. */
async function limitedPost(body = 'Hey you worthless idiot') {
  const created = await createPost(actorFor(author), { body }, 'req-author-view-0001');
  await createReport(actorFor(reporter), created.id, { reason: 'harassment' }, 'req-author-view-0002');
  await runPendingJobs();
  const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
  const decision = await decide(
    actorFor(decider),
    kase.id,
    {
      kind: 'modify',
      analysisId: kase.currentAnalysisId ?? '',
      finalAction: 'limit',
      clauseCodes: ['HAR-1'],
      reasonCategory: 'severity_too_low',
      rationale: 'Internal note: second insult this week.',
    },
    'req-author-view-0003',
  );
  return { contentId: created.id, caseId: kase.id, decisionId: decision.decisionId };
}

function historyAs(cookie: string, contentId: string) {
  return historyRoute(apiRequest(`/api/content/${contentId}/history`, { cookie }));
}

describe('history', () => {
  it('[CNT-4] the author sees a plain timeline of their item, without AI internals, staff or reporters', async () => {
    const p = await limitedPost();
    const { appealId } = await createAppeal(
      actorFor(author),
      p.decisionId,
      { statement: 'It was a joke between friends, nobody was hurt.', evidenceLinks: [], evidenceNote: null },
      'req-author-view-0004',
    );
    await runPendingJobs();
    await resolveAppeal(
      actorFor(reviewer),
      appealId,
      { outcome: 'overturn', rationale: 'Context shows a joke between friends.' },
      'req-author-view-0005',
    );

    const res = await historyAs(authorCookie, p.contentId);
    expect(res.status).toBe(200);
    const { data } = await readJson<HistoryBody>(res);
    expect(data.view).toBe('author');
    expect(data.events.map((e) => e.kind)).toEqual([
      'created',
      'analysis',
      'analysis',
      'decision',
      'appeal',
      'appeal_resolved',
    ]);
    const decision = data.events.find((e) => e.kind === 'decision');
    expect(decision?.lines[0]).toBe('A moderator limited this under HAR-1 (Harassment and insults).');
    expect(data.events.at(-1)?.lines).toEqual([
      'A senior moderator overturned the decision. Your content is visible again.',
    ]);
    expect(data.events.find((e) => e.kind === 'analysis')?.title).toBe('Checked against policy v1');

    const text = JSON.stringify(data);
    for (const hidden of [
      decider.name,
      reviewer.name,
      reporter.name,
      reporter.id,
      'Internal note',
      'Context shows a joke',
      'aiStatus',
      'AI status',
      'Model',
      'mock',
      'tokens',
      'harassment',
    ]) {
      expect(text, `author view leaks "${hidden}"`).not.toContain(hidden);
    }
    expect(data.events.every((e) => e.facts === undefined)).toBe(true);
    expect(data.auditEvents).toBeUndefined();
    expect(data.content.authorName).toBeNull();
  });

  it('[CNT-4] staff see the full detail: AI run facts, deciders, rationales, report reasons and audit events', async () => {
    const p = await limitedPost();
    const moderator = await createUser('moderator');
    const res = await historyAs(await sessionCookieFor(moderator.id), p.contentId);
    expect(res.status).toBe(200);
    const { data } = await readJson<HistoryBody>(res);
    expect(data.view).toBe('staff');
    expect(data.content.authorName).toBe(author.name);
    const analysis = data.events.find((e) => e.kind === 'analysis');
    expect(analysis?.facts?.map((f) => f.label)).toEqual(
      expect.arrayContaining(['AI status', 'Model', 'Tokens in / out / thinking', 'Estimated cost']),
    );
    const decision = data.events.find((e) => e.kind === 'decision');
    expect(decision?.lines.join(' ')).toContain(decider.name);
    expect(decision?.lines.join(' ')).toContain('Internal note: second insult this week.');
    expect(data.events.find((e) => e.kind === 'reported')?.lines).toEqual(['Reason: harassment.']);
    expect(data.events.some((e) => e.kind === 'visibility')).toBe(true);
    expect(data.auditEvents?.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'content.created',
        'case.opened',
        'analysis.created',
        'decision.created',
        'visibility.changed',
      ]),
    );
    // Reporter identities are not part of the history, even for staff.
    const text = JSON.stringify(data);
    expect(text).not.toContain(reporter.name);
    expect(text).not.toContain(reporter.id);
  });

  it("[SEC-2] author B cannot read author A's history (403); a missing item is 404", async () => {
    const p = await limitedPost();
    const res = await historyAs(await sessionCookieFor(reporter.id), p.contentId);
    expect(res.status).toBe(403);
    expect((await readJson<{ error: { code: string } }>(res)).error.code).toBe('FORBIDDEN');
    expect((await historyAs(authorCookie, 'no-such-item')).status).toBe(404);
  });

  it("[SEC-2] author B cannot appeal author A's decision by changing the identifier", async () => {
    const p = await limitedPost();
    const res = await createAppealRoute(
      apiRequest(`/api/decisions/${p.decisionId}/appeals`, {
        method: 'POST',
        cookie: await sessionCookieFor(reporter.id),
        body: { statement: 'Appealing someone else decision here.' },
      }),
    );
    expect(res.status).toBe(403);
    expect(await getDb().appeal.count()).toBe(0);
  });
});

describe('my content', () => {
  it("[APP-1] lists only the author's own items with the decision in plain words and the appeal deadline", async () => {
    const p = await limitedPost();
    await createPost(actorFor(reporter), { body: 'Someone else post entirely' }, 'req-author-view-0006');
    const res = await myContentRoute(apiRequest('/api/me/content', { cookie: authorCookie }));
    expect(res.status).toBe(200);
    const { data } = await readJson<MyContentBody>(res);
    expect(data.items).toHaveLength(1);
    const item = data.items[0];
    expect(item).toMatchObject({
      id: p.contentId,
      visibility: 'limited',
      caseStatus: 'resolved',
      decision: {
        finalAction: 'limit',
        summary: 'A moderator limited this under HAR-1 (Harassment and insults).',
        clauses: [{ code: 'HAR-1', title: 'Harassment and insults' }],
      },
      appeal: null,
      appealability: { canAppeal: true, reason: null },
    });
    const decidedAt = (await getDb().decision.findUniqueOrThrow({ where: { id: p.decisionId } })).createdAt;
    expect(item?.appealability?.until).toBe(new Date(decidedAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString());
    expect(JSON.stringify(data)).not.toContain('Internal note');
  });

  it('[APP-5] the author sees the appeal state and then the outcome in My content', async () => {
    const p = await limitedPost();
    const { appealId } = await createAppeal(
      actorFor(author),
      p.decisionId,
      { statement: 'It was a joke between friends, nobody was hurt.', evidenceLinks: [], evidenceNote: null },
      'req-author-view-0007',
    );
    const read = async () =>
      (await readJson<MyContentBody>(await myContentRoute(apiRequest('/api/me/content', { cookie: authorCookie }))))
        .data.items[0];

    expect(await read()).toMatchObject({
      caseStatus: 'appealed',
      appeal: { status: 'pending', summary: 'Appeal sent. A senior moderator will review it.' },
      appealability: { canAppeal: false, reason: 'You have already appealed this decision.' },
    });

    await resolveAppeal(
      actorFor(reviewer),
      appealId,
      { outcome: 'modify', finalAction: 'label', rationale: 'A label is enough for this one.' },
      'req-author-view-0008',
    );
    expect(await read()).toMatchObject({
      visibility: 'labeled',
      caseStatus: 'appeal_resolved',
      appeal: {
        status: 'resolved',
        outcome: 'modify',
        summary: 'A senior moderator changed the decision: your content is now labelled.',
      },
    });
  });

  it('[SEC-2] My content is for authors only', async () => {
    const res = await myContentRoute(apiRequest('/api/me/content', { cookie: await sessionCookieFor(decider.id) }));
    expect(res.status).toBe(403);
  });

  it('[CNT-5] the feed names the clause for everyone and the appeal deadline for the author only', async () => {
    const p = await limitedPost();
    const feedFor = async (cookie: string) =>
      (
        await readJson<{
          data: { items: Array<{ id: string; moderation: { clauseCodes: string[]; appealUntil: string | null } }> };
        }>(await feedRoute(apiRequest('/api/posts', { cookie })))
      ).data.items.find((i) => i.id === p.contentId);
    const own = await feedFor(authorCookie);
    expect(own?.moderation.clauseCodes).toEqual(['HAR-1']);
    expect(own?.moderation.appealUntil).not.toBeNull();
    const other = await feedFor(await sessionCookieFor(reporter.id));
    expect(other?.moderation).toEqual({ clauseCodes: ['HAR-1'], appealUntil: null });
  });
});
