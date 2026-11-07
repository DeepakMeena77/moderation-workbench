import type { User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as appealRoute } from '@/app/api/appeals/[id]/route';
import { POST as resolveRoute } from '@/app/api/appeals/[id]/resolve/route';
import { GET as appealsRoute } from '@/app/api/appeals/route';
import { POST as createAppealRoute } from '@/app/api/decisions/[id]/appeals/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { createPost } from '@/server/services/content';
import { decide } from '@/server/services/decisions';
import { createReport } from '@/server/services/reports';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// Appeals and the second review (APP-1..5, AI-12, SEC-2) through the API routes, the appeal_brief job and the
// mock AI provider.

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const DAY = 24 * 60 * 60 * 1000;
const STATEMENT = 'I was quoting a film line the whole thread was discussing, not insulting anyone.';

let author: User;
let decider: User;
let reviewer: User;
let authorCookie: string;
let deciderCookie: string;
let reviewerCookie: string;
let postCount = 0;

beforeEach(async () => {
  await installPolicy(1);
  author = await createUser('author');
  // Created first, so it is the "oldest" senior: routing must still skip it when it made the decision.
  decider = await createUser('senior_moderator');
  reviewer = await createUser('senior_moderator');
  [authorCookie, deciderCookie, reviewerCookie] = await Promise.all([
    sessionCookieFor(author.id),
    sessionCookieFor(decider.id),
    sessionCookieFor(reviewer.id),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

type Decision =
  | { kind: 'modify'; finalAction: 'label' | 'limit' | 'remove'; clauseCodes: string[] }
  | { kind: 'reject' }
  | { kind: 'approve' };

/** A post by `by`, analysed by the job (mock AI) and decided by `decidedBy`. */
async function decidedPost(
  options: { by?: User; decidedBy?: User; decision?: Decision; body?: string } = {},
): Promise<{ caseId: string; contentId: string; decisionId: string }> {
  postCount += 1;
  const by = options.by ?? author;
  const body = options.body ?? `Post ${postCount}: you are a worthless idiot`;
  const created = await createPost(actorFor(by), { body }, `req-appeal-post-${postCount}`);
  await runPendingJobs();
  const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
  expect(kase.status).toBe('awaiting_review');
  const decision = options.decision ?? { kind: 'modify', finalAction: 'limit', clauseCodes: ['HAR-1'] };
  const analysisId = kase.currentAnalysisId ?? '';
  const input =
    decision.kind === 'modify'
      ? {
          ...decision,
          analysisId,
          reasonCategory: 'severity_too_low' as const,
          rationale: 'Repeated insults aimed at the same person.',
        }
      : decision.kind === 'reject'
        ? {
            kind: 'reject' as const,
            analysisId,
            reasonCategory: 'false_positive' as const,
            rationale: 'Friendly banter between regulars.',
          }
        : { kind: 'approve' as const, analysisId };
  const result = await decide(actorFor(options.decidedBy ?? decider), kase.id, input, `req-decide-${postCount}`);
  return { caseId: kase.id, contentId: created.id, decisionId: result.decisionId };
}

function appealAs(cookie: string, decisionId: string, body: unknown) {
  return createAppealRoute(apiRequest(`/api/decisions/${decisionId}/appeals`, { method: 'POST', cookie, body }));
}

function resolveAs(cookie: string, appealId: string, body: unknown) {
  return resolveRoute(apiRequest(`/api/appeals/${appealId}/resolve`, { method: 'POST', cookie, body }));
}

async function appealOk(decisionId: string, body: unknown = { statement: STATEMENT }): Promise<string> {
  const res = await appealAs(authorCookie, decisionId, body);
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  return (await readJson<{ data: { appealId: string } }>(res)).data.appealId;
}

async function getAppealAs(cookie: string, appealId: string) {
  const res = await appealRoute(apiRequest(`/api/appeals/${appealId}`, { cookie }));
  expect(res.status).toBe(200);
  return (await readJson<{ data: Record<string, unknown> & AppealDetailShape }>(res)).data;
}

interface AppealDetailShape {
  status: string;
  original: {
    finalAction: string;
    clauseCodes: string[];
    rationale: string;
    policyVersion: number;
    findings: unknown[];
  };
  evidence: { statement: string; links: string[]; note: string | null };
  brief: { state: string; summary?: string; newPoints?: string[]; disputedFindings?: unknown[]; reason?: string };
  outcome: { outcome: string; finalAction: string; rationale: string } | null;
  policyChangedSinceDecision: boolean;
  activePolicyVersion: number | null;
  permissions: { canResolve: boolean; isOriginalDecider: boolean; readOnly: boolean };
}

const visibilityOf = async (contentId: string) =>
  (await getDb().content.findUniqueOrThrow({ where: { id: contentId } })).visibility;
const caseStatus = async (caseId: string) => (await getDb().case.findUniqueOrThrow({ where: { id: caseId } })).status;

describe('appeal create', () => {
  it('[APP-1] the author appeals a decision with an action, within the window, with evidence', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId, {
      statement: `  ${STATEMENT}  `,
      evidenceLinks: ['https://example.com/film-quote', 'https://example.com/film-quote'],
      evidenceNote: 'The parent post is about the film.',
    });

    const appeal = await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } });
    expect(appeal).toMatchObject({
      decisionId: c.decisionId,
      caseId: c.caseId,
      authorId: author.id,
      statement: STATEMENT,
      evidenceLinks: ['https://example.com/film-quote'],
      evidenceNote: 'The parent post is about the film.',
      status: 'pending',
      outcome: null,
    });
    expect(await caseStatus(c.caseId)).toBe('appealed');
    // The visibility stays as decided until a senior moderator resolves the appeal.
    expect(await visibilityOf(c.contentId)).toBe('limited');
    const job = await getDb().job.findFirstOrThrow({ where: { type: 'appeal_brief' } });
    expect(job.payload).toEqual({ appealId });
    const actions = (await getDb().auditEvent.findMany({ where: { entityId: appealId }, orderBy: { id: 'asc' } })).map(
      (e) => [e.action, e.actorType],
    );
    expect(actions).toEqual([
      ['appeal.created', 'human'],
      ['appeal.assigned', 'system'],
    ]);
  });

  it('[APP-1] validates the statement (20-2,000 characters) and the evidence (<= 3 http(s) links)', async () => {
    const c = await decidedPost();
    const cases: Array<[unknown, string]> = [
      [{ statement: 'too short' }, 'statement'],
      [{ statement: 'x'.repeat(2001) }, 'statement'],
      [
        { statement: STATEMENT, evidenceLinks: ['a', 'b', 'c', 'd'].map((s) => `https://example.com/${s}`) },
        'evidenceLinks',
      ],
      [{ statement: STATEMENT, evidenceLinks: ['javascript:alert(1)'] }, 'evidenceLinks.0'],
      [{ statement: STATEMENT, evidenceNote: 'n'.repeat(1001) }, 'evidenceNote'],
    ];
    for (const [body, path] of cases) {
      const res = await appealAs(authorCookie, c.decisionId, body);
      expect(res.status).toBe(400);
      const { error } = await readJson<{ error: { details: Array<{ path: string; message: string }> } }>(res);
      expect(error.details.map((d) => d.path)).toContain(path);
    }
    const tooShort = await appealAs(authorCookie, c.decisionId, { statement: 'short' });
    expect(
      (await readJson<{ error: { details: Array<{ message: string }> } }>(tooShort)).error.details[0]?.message,
    ).toBe('Explain your appeal in at least 20 characters.');
    expect(await getDb().appeal.count()).toBe(0);
  });

  it('[APP-2] a non-author gets 403, a second appeal 409, and an appeal on "none" 422', async () => {
    const c = await decidedPost();
    const other = await createUser('author');
    const otherRes = await appealAs(await sessionCookieFor(other.id), c.decisionId, { statement: STATEMENT });
    expect(otherRes.status).toBe(403);
    expect((await readJson<ErrorBody>(otherRes)).error.code).toBe('FORBIDDEN');

    // Staff have no appeal route at all.
    const staffRes = await appealAs(reviewerCookie, c.decisionId, { statement: STATEMENT });
    expect(staffRes.status).toBe(403);

    await appealOk(c.decisionId);
    const again = await appealAs(authorCookie, c.decisionId, { statement: STATEMENT });
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error.code).toBe('ALREADY_APPEALED');

    const rejected = await decidedPost({ decision: { kind: 'reject' } });
    const none = await appealAs(authorCookie, rejected.decisionId, { statement: STATEMENT });
    expect(none.status).toBe(422);
    expect((await readJson<ErrorBody>(none)).error.code).toBe('NOT_APPEALABLE');

    const missing = await appealAs(authorCookie, 'no-such-decision', { statement: STATEMENT });
    expect(missing.status).toBe(404);
    expect(await getDb().appeal.count()).toBe(1);
  });

  it('[APP-2] an appeal after APPEAL_WINDOW_DAYS gets 409 with the deadline', async () => {
    const c = await decidedPost();
    const decidedAt = (await getDb().decision.findUniqueOrThrow({ where: { id: c.decisionId } })).createdAt;
    vi.useFakeTimers({ toFake: ['Date'] });

    // Sessions last less than the window, so each request carries a cookie signed at the pinned time.
    const lateAt = new Date(decidedAt.getTime() + 14 * DAY + 60_000);
    vi.setSystemTime(lateAt);
    const late = await appealAs(await sessionCookieFor(author.id, lateAt), c.decisionId, { statement: STATEMENT });
    expect(late.status).toBe(409);
    const { error } = await readJson<{ error: { code: string; message: string; details: { deadline: string } } }>(late);
    expect(error.code).toBe('APPEAL_WINDOW_CLOSED');
    expect(error.details.deadline).toBe(new Date(decidedAt.getTime() + 14 * DAY).toISOString());
    expect(error.message).toMatch(/^The appeal window closed on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/);

    const inTimeAt = new Date(decidedAt.getTime() + 14 * DAY - 60_000);
    vi.setSystemTime(inTimeAt);
    const inTime = await appealAs(await sessionCookieFor(author.id, inTimeAt), c.decisionId, { statement: STATEMENT });
    expect(inTime.status).toBe(200);
  });

  it('[APP-2] a decision superseded by a new report is no longer appealable (409)', async () => {
    const c = await decidedPost();
    // A report on a resolved item reopens it (CNT-3f).
    const reporter = await createUser('author');
    await createReport(actorFor(reporter), c.contentId, { reason: 'harassment' }, 'req-report-0001');
    expect(await caseStatus(c.caseId)).toBe('pending_analysis');
    const res = await appealAs(authorCookie, c.decisionId, { statement: STATEMENT });
    expect(res.status).toBe(409);
    expect((await readJson<ErrorBody>(res)).error.code).toBe('INVALID_TRANSITION');
  });
});

describe('second review routing', () => {
  it('[APP-3] routes to the least-loaded senior moderator who is not the decider', async () => {
    const third = await createUser('senior_moderator');
    // Decided by `decider`: both others have 0 pending, so the older account (reviewer) gets it.
    const first = await appealOk((await decidedPost()).decisionId);
    // Decided by `decider` again: reviewer now has 1, third has 0.
    const second = await appealOk((await decidedPost()).decisionId);
    // Decided by `reviewer`: decider 0, third 1 -> decider, never the reviewer who decided.
    const thirdAppeal = await appealOk((await decidedPost({ decidedBy: reviewer })).decisionId);

    const assigned = async (id: string) =>
      (await getDb().appeal.findUniqueOrThrow({ where: { id } })).assignedReviewerId;
    expect(await assigned(first)).toBe(reviewer.id);
    expect(await assigned(second)).toBe(third.id);
    expect(await assigned(thirdAppeal)).toBe(decider.id);
  });

  it('[APP-3] with no eligible senior the appeal stays unassigned and the list warns', async () => {
    await getDb().user.update({ where: { id: reviewer.id }, data: { role: 'moderator' } });
    const appealId = await appealOk((await decidedPost()).decisionId);
    expect((await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } })).assignedReviewerId).toBeNull();
    const assignedEvent = await getDb().auditEvent.findFirstOrThrow({
      where: { entityId: appealId, action: 'appeal.assigned' },
    });
    expect(assignedEvent.after).toMatchObject({ assignedReviewerId: null, reason: 'no_eligible_senior' });

    const res = await appealsRoute(apiRequest('/api/appeals', { cookie: deciderCookie }));
    const { data } = await readJson<{ data: { unassigned: number; items: Array<{ ownDecision: boolean }> } }>(res);
    expect(data.unassigned).toBe(1);
    expect(data.items[0]?.ownDecision).toBe(true);
  });

  it('[APP-3] the original decider gets 403 SAME_REVIEWER and sees the appeal read-only', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);

    const view = await getAppealAs(deciderCookie, appealId);
    expect(view.permissions).toEqual({ canResolve: false, isOriginalDecider: true, readOnly: false });

    const res = await resolveAs(deciderCookie, appealId, {
      outcome: 'overturn',
      rationale: 'I changed my mind on it.',
    });
    expect(res.status).toBe(403);
    expect((await readJson<ErrorBody>(res)).error.code).toBe('SAME_REVIEWER');
    expect(await visibilityOf(c.contentId)).toBe('limited');
    expect((await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } })).status).toBe('pending');
  });

  it('[APP-3] any other senior may resolve; moderators and admins may only read', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);
    const moderator = await createUser('moderator');
    const admin = await createUser('admin');
    for (const user of [moderator, admin]) {
      const cookie = await sessionCookieFor(user.id);
      const view = await getAppealAs(cookie, appealId);
      expect(view.permissions).toMatchObject({ canResolve: false, readOnly: true });
      const res = await resolveAs(cookie, appealId, { outcome: 'overturn', rationale: 'Not my call to make.' });
      expect(res.status).toBe(403);
      expect((await readJson<ErrorBody>(res)).error.code).toBe('FORBIDDEN');
    }
    // A senior who is neither the decider nor the assigned reviewer may still resolve (routing is a hint).
    const other = await createUser('senior_moderator');
    expect((await getAppealAs(await sessionCookieFor(other.id), appealId)).permissions.canResolve).toBe(true);
    const ok = await resolveAs(await sessionCookieFor(other.id), appealId, {
      outcome: 'uphold',
      rationale: 'The insult is aimed at the reader.',
    });
    expect(ok.status).toBe(200);
    const audit = await getDb().auditEvent.findFirstOrThrow({
      where: { entityId: appealId, action: 'appeal.resolved' },
    });
    expect(audit.after).toMatchObject({ outcome: 'uphold', byAssignedReviewer: false });
  });
});

describe('appeal resolve', () => {
  it('[APP-5] overturn restores visibility and the case becomes appeal_resolved', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);
    const missing = await resolveAs(reviewerCookie, appealId, { outcome: 'overturn', rationale: 'short' });
    expect(missing.status).toBe(400);

    const res = await resolveAs(reviewerCookie, appealId, {
      outcome: 'overturn',
      rationale: 'The words quote the film the thread discusses.',
    });
    expect(res.status).toBe(200);
    expect((await readJson<{ data: unknown }>(res)).data).toMatchObject({
      outcome: 'overturn',
      originalAction: 'limit',
      finalAction: 'none',
      visibility: 'visible',
    });
    expect(await visibilityOf(c.contentId)).toBe('visible');
    expect(await caseStatus(c.caseId)).toBe('appeal_resolved');
    expect(await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } })).toMatchObject({
      status: 'resolved',
      outcome: 'overturn',
      finalAction: 'none',
      resolverId: reviewer.id,
      rationale: 'The words quote the film the thread discusses.',
    });
    // AUD-1: the visibility change names the appeal, and the resolution has its own event.
    const visibility = await getDb().auditEvent.findFirstOrThrow({
      where: { entityId: c.contentId, action: 'visibility.changed' },
      orderBy: { id: 'desc' },
    });
    expect(visibility).toMatchObject({ actorId: reviewer.id, actorType: 'human' });
    expect(visibility.after).toMatchObject({ visibility: 'visible', appealId });
    expect(await getDb().auditEvent.count({ where: { entityId: appealId, action: 'appeal.resolved' } })).toBe(1);

    const again = await resolveAs(reviewerCookie, appealId, { outcome: 'uphold', rationale: 'Second thoughts here.' });
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error.code).toBe('ALREADY_DECIDED');
  });

  it('[APP-5] modify sets a new action the decision clauses allow; uphold keeps the action', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);
    const same = await resolveAs(reviewerCookie, appealId, {
      outcome: 'modify',
      finalAction: 'limit',
      rationale: 'Keeping the same action here.',
    });
    expect(same.status).toBe(400);
    const res = await resolveAs(reviewerCookie, appealId, {
      outcome: 'modify',
      finalAction: 'label',
      rationale: 'A label is enough for a one-off insult.',
    });
    expect(res.status).toBe(200);
    expect(await visibilityOf(c.contentId)).toBe('labeled');
    expect((await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } })).finalAction).toBe('label');

    // THR-1 allows only limit and remove, so modifying a THR-1 decision to "label" is refused.
    const threat = await decidedPost({ decision: { kind: 'modify', finalAction: 'limit', clauseCodes: ['THR-1'] } });
    const threatAppeal = await appealOk(threat.decisionId);
    const notAllowed = await resolveAs(reviewerCookie, threatAppeal, {
      outcome: 'modify',
      finalAction: 'label',
      rationale: 'A label would be enough here.',
    });
    expect(notAllowed.status).toBe(422);
    expect((await readJson<ErrorBody>(notAllowed)).error.code).toBe('ACTION_NOT_ALLOWED');

    const upheld = await resolveAs(reviewerCookie, threatAppeal, {
      outcome: 'uphold',
      rationale: 'The threat is explicit and credible.',
    });
    expect(upheld.status).toBe(200);
    expect(await visibilityOf(threat.contentId)).toBe('limited');
    expect(await caseStatus(threat.caseId)).toBe('appeal_resolved');
  });

  it('[APP-5] a resolved appeal cannot be changed or deleted, even by a direct UPDATE', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);
    await resolveAs(reviewerCookie, appealId, { outcome: 'uphold', rationale: 'The insult is aimed at the reader.' });
    await expect(
      getDb().appeal.update({ where: { id: appealId }, data: { outcome: 'overturn', finalAction: 'none' } }),
    ).rejects.toThrow(/already resolved/);
    await expect(getDb().appeal.delete({ where: { id: appealId } })).rejects.toThrow(/DELETE/);
  });
});

describe('appeal review page', () => {
  it('[APP-4] returns the original decision, the appeal evidence and the outcome', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId, {
      statement: STATEMENT,
      evidenceLinks: ['https://example.com/scene'],
    });
    const before = await getAppealAs(reviewerCookie, appealId);
    expect(before.original).toMatchObject({
      finalAction: 'limit',
      clauseCodes: ['HAR-1'],
      rationale: 'Repeated insults aimed at the same person.',
      policyVersion: 1,
    });
    expect(before.original.findings.length).toBeGreaterThan(0);
    expect(before.evidence).toEqual({ statement: STATEMENT, links: ['https://example.com/scene'], note: null });
    expect(before.outcome).toBeNull();
    expect(before.brief.state).toBe('pending');
    expect(before.permissions).toEqual({ canResolve: true, isOriginalDecider: false, readOnly: false });

    await resolveAs(reviewerCookie, appealId, {
      outcome: 'overturn',
      rationale: 'It quotes the film being discussed.',
    });
    const after = await getAppealAs(reviewerCookie, appealId);
    expect(after.outcome).toMatchObject({ outcome: 'overturn', finalAction: 'none' });
    expect(after.permissions.canResolve).toBe(false);
  });

  it('[APP-4] the list shows appeals assigned to the viewer first, then by waiting age', async () => {
    const third = await createUser('senior_moderator');
    const a = await appealOk((await decidedPost()).decisionId); // -> reviewer
    const b = await appealOk((await decidedPost()).decisionId); // -> third
    const res = await appealsRoute(apiRequest('/api/appeals', { cookie: await sessionCookieFor(third.id) }));
    const { data } = await readJson<{ data: { items: Array<{ id: string; assignedToMe: boolean }>; total: number } }>(
      res,
    );
    expect(data.total).toBe(2);
    expect(data.items.map((i) => [i.id, i.assignedToMe])).toEqual([
      [b, true],
      [a, false],
    ]);
  });
});

describe('appeal brief job', () => {
  it('[AI-12] writes a neutral brief and an AiRun through the bounded pipeline, never an outcome', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId, {
      statement: STATEMENT,
      evidenceLinks: ['https://example.com/scene'],
    });
    const summary = await runPendingJobs();
    expect(summary.succeeded).toBe(1);

    const appeal = await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } });
    expect(appeal.brief).toMatchObject({
      aiStatus: 'ok',
      disputedFindings: [expect.objectContaining({ clauseCode: 'HAR-1' })],
    });
    const keys = Object.keys(appeal.brief as Record<string, unknown>).sort();
    expect(keys).toEqual([
      'aiStatus',
      'disputedFindings',
      'droppedClauses',
      'flags',
      'newPoints',
      'summary',
      'unavailableReason',
    ]);
    // flags is set by the server's verify step, not the model, and holds only the outcome-language check.
    expect((appeal.brief as { flags: unknown }).flags).toEqual({ outcomeLanguage: false });
    // HUM-1: the job changed nothing a human owns.
    expect(appeal).toMatchObject({ status: 'pending', outcome: null, finalAction: null });
    expect(await visibilityOf(c.contentId)).toBe('limited');
    expect(await caseStatus(c.caseId)).toBe('appealed');

    const run = await getDb().aiRun.findUniqueOrThrow({ where: { id: appeal.briefAiRunId ?? '' } });
    expect(run).toMatchObject({
      purpose: 'appeal_brief',
      status: 'ok',
      promptVersion: 'appeal-brief.v1',
      policyVersion: 1,
    });
    expect(run.inputTokens).toBeGreaterThan(0);
    expect(Number(run.costUsd)).toBeGreaterThan(0);
    const event = await getDb().auditEvent.findFirstOrThrow({
      where: { entityId: appealId, action: 'appeal.brief_created' },
    });
    expect(event).toMatchObject({ actorType: 'ai', actorId: null });

    const view = await getAppealAs(reviewerCookie, appealId);
    expect(view.brief.state).toBe('ready');
    expect(view.brief.summary).toBeTruthy();
    expect(JSON.stringify(view.brief)).not.toMatch(/uphold|overturn|recommend/i);
  });

  it('[AI-12] an AI failure is a successful job: the brief is marked unavailable and the AiRun recorded', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId, { statement: `${STATEMENT} [mock:invalid]` });
    const summary = await runPendingJobs();
    expect(summary).toMatchObject({ succeeded: 1, failed: 0, requeued: 0 });

    const appeal = await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } });
    const run = await getDb().aiRun.findUniqueOrThrow({ where: { id: appeal.briefAiRunId ?? '' } });
    expect(run).toMatchObject({ purpose: 'appeal_brief', status: 'invalid_output', repairUsed: true, attempts: 2 });
    const view = await getAppealAs(reviewerCookie, appealId);
    expect(view.brief).toEqual({ state: 'unavailable', reason: 'AI output was invalid even after one repair' });
    // A second run of the job writes nothing new.
    await getDb().job.updateMany({ where: { type: 'appeal_brief' }, data: { status: 'queued', attempts: 0 } });
    await runPendingJobs();
    expect(await getDb().aiRun.count({ where: { purpose: 'appeal_brief' } })).toBe(1);
  });

  it('[AI-12] "policy changed since decision" comes from the database, not the model', async () => {
    const c = await decidedPost();
    const appealId = await appealOk(c.decisionId);
    await runPendingJobs();
    expect((await getAppealAs(reviewerCookie, appealId)).policyChangedSinceDecision).toBe(false);

    await getDb().policy.update({ where: { version: 1 }, data: { status: 'retired' } });
    await installPolicy(2);
    const view = await getAppealAs(reviewerCookie, appealId);
    expect(view).toMatchObject({ policyChangedSinceDecision: true, activePolicyVersion: 2 });
    expect(JSON.stringify((await getDb().appeal.findUniqueOrThrow({ where: { id: appealId } })).brief)).not.toMatch(
      /policy/i,
    );
  });
});
