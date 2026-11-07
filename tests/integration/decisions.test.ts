import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as decideRoute } from '@/app/api/cases/[id]/decisions/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { createAppeal, resolveAppeal } from '@/server/services/appeals';
import { requestReanalysis } from '@/server/services/cases';
import { createPost } from '@/server/services/content';
import { setVisibility } from '@/server/services/visibility';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// Human decisions (HUM-1..7, AUD-1, AUD-2) through POST /api/cases/:id/decisions and setVisibility.

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

interface ErrorBody {
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}
interface DecisionBody {
  data: { decisionId: string; kind: string; recommendedAction: string; finalAction: string; visibility: string };
}

let moderator: User;
let moderatorCookie: string;

beforeEach(async () => {
  await installPolicy(1);
  moderator = await createUser('moderator');
  moderatorCookie = await sessionCookieFor(moderator.id);
});

/** A post analysed by the (rule-only) job, so its case is awaiting_review with a current analysis. */
async function caseFor(body: string) {
  const author = await createUser('author');
  const created = await createPost(actorFor(author), { body }, 'req-decide-0001');
  await runPendingJobs();
  const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
  expect(kase.status).toBe('awaiting_review');
  return { caseId: kase.id, contentId: created.id, analysisId: kase.currentAnalysisId ?? '' };
}

function decideAs(cookie: string, caseId: string, body: unknown) {
  return decideRoute(apiRequest(`/api/cases/${caseId}/decisions`, { method: 'POST', cookie, body }));
}

const visibilityOf = async (contentId: string) =>
  (await getDb().content.findUniqueOrThrow({ where: { id: contentId } })).visibility;

describe('decide', () => {
  it('[HUM-2] approve applies the recommended action and resolves the case', async () => {
    const c = await caseFor('You are a worthless idiot');
    const res = await decideAs(moderatorCookie, c.caseId, { kind: 'approve', analysisId: c.analysisId });
    expect(res.status).toBe(200);
    const { data } = await readJson<DecisionBody>(res);
    expect(data).toMatchObject({ kind: 'approve', recommendedAction: 'label', finalAction: 'label' });
    expect(await visibilityOf(c.contentId)).toBe('labeled');
    expect((await getDb().case.findUniqueOrThrow({ where: { id: c.caseId } })).status).toBe('resolved');
  });

  it('[HUM-3] reject needs a reason and a note of at least 10 characters, and leaves the content visible', async () => {
    const c = await caseFor('You are a worthless idiot');
    const invalid = await decideAs(moderatorCookie, c.caseId, {
      kind: 'reject',
      analysisId: c.analysisId,
      rationale: 'too short',
    });
    expect(invalid.status).toBe(400);
    const { error } = await readJson<ErrorBody>(invalid);
    expect(error.details?.map((d) => d.path).sort()).toEqual(['rationale', 'reasonCategory']);
    expect(error.details?.find((d) => d.path === 'rationale')?.message).toBe(
      'Explain your change in at least 10 characters.',
    );
    expect(await getDb().decision.count()).toBe(0);

    const ok = await decideAs(moderatorCookie, c.caseId, {
      kind: 'reject',
      analysisId: c.analysisId,
      reasonCategory: 'false_positive',
      rationale: 'Friendly banter between two regulars.',
    });
    expect(ok.status).toBe(200);
    expect((await readJson<DecisionBody>(ok)).data).toMatchObject({ finalAction: 'none', visibility: 'visible' });
    expect(await visibilityOf(c.contentId)).toBe('visible');
  });

  it('[HUM-4] modify needs clauses from the policy and an action at least one of them allows', async () => {
    const c = await caseFor('You are a worthless idiot');
    const base = { kind: 'modify', analysisId: c.analysisId, reasonCategory: 'severity_too_low' };

    const unknownClause = await decideAs(moderatorCookie, c.caseId, {
      ...base,
      clauseCodes: ['HAR-9'],
      finalAction: 'limit',
      rationale: 'Repeated insults at the same person.',
    });
    expect(unknownClause.status).toBe(400);
    expect((await readJson<ErrorBody>(unknownClause)).error.details?.[0]?.path).toBe('clauseCodes');

    // PII-1 allows limit and remove only, so "label" is refused.
    const notAllowed = await decideAs(moderatorCookie, c.caseId, {
      ...base,
      clauseCodes: ['PII-1'],
      finalAction: 'label',
      rationale: 'Shares a phone number in the insult.',
    });
    expect(notAllowed.status).toBe(422);
    expect((await readJson<ErrorBody>(notAllowed)).error.code).toBe('ACTION_NOT_ALLOWED');

    const shortRationale = await decideAs(moderatorCookie, c.caseId, {
      ...base,
      clauseCodes: ['HAR-1'],
      finalAction: 'limit',
      rationale: 'meh',
    });
    expect(shortRationale.status).toBe(400);

    const ok = await decideAs(moderatorCookie, c.caseId, {
      ...base,
      clauseCodes: ['har-1'],
      finalAction: 'limit',
      rationale: 'Repeated insults at the same person.',
    });
    expect(ok.status).toBe(200);
    expect(await visibilityOf(c.contentId)).toBe('limited');
    expect(await getDb().decision.findFirstOrThrow()).toMatchObject({ clauseCodes: ['HAR-1'], finalAction: 'limit' });
  });

  it('[HUM-5] the decision stores the analysis, the policy version and the recommended vs final action', async () => {
    const c = await caseFor('You are a worthless idiot');
    await decideAs(moderatorCookie, c.caseId, {
      kind: 'modify',
      analysisId: c.analysisId,
      clauseCodes: ['HAR-1'],
      finalAction: 'remove',
      reasonCategory: 'severity_too_low',
      rationale: 'Targeted abuse after a warning.',
    });
    const decision = await getDb().decision.findFirstOrThrow();
    expect(decision).toMatchObject({
      caseId: c.caseId,
      analysisId: c.analysisId,
      policyVersion: 1,
      deciderId: moderator.id,
      kind: 'modify',
      recommendedAction: 'label',
      finalAction: 'remove',
      clauseCodes: ['HAR-1'],
      reasonCategory: 'severity_too_low',
      rationale: 'Targeted abuse after a warning.',
    });
    // AUD-1: the decision and the visibility change are audited in the same transaction.
    const events = await getDb().auditEvent.findMany({
      where: { action: { in: ['decision.created', 'visibility.changed'] } },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => [e.action, e.actorType, e.actorId, e.policyVersion])).toEqual([
      ['visibility.changed', 'human', moderator.id, 1],
      ['decision.created', 'human', moderator.id, 1],
    ]);
  });

  it('[HUM-6] deciding on an outdated analysis returns 409 STALE_ANALYSIS and changes nothing', async () => {
    const c = await caseFor('You are a worthless idiot');
    // A second analysis (seq 2) makes the first one outdated.
    await requestReanalysis(actorFor(moderator), c.caseId, 'req-reanalyse-0001');
    await runPendingJobs();
    const res = await decideAs(moderatorCookie, c.caseId, { kind: 'approve', analysisId: c.analysisId });
    expect(res.status).toBe(409);
    const { error } = await readJson<ErrorBody>(res);
    expect(error.code).toBe('STALE_ANALYSIS');
    expect(error.message).toMatch(/Reload to decide on the latest analysis/);
    expect(await getDb().decision.count()).toBe(0);
    expect(await visibilityOf(c.contentId)).toBe('visible');
  });

  it('[HUM-6] deciding a case that is already resolved returns 409 ALREADY_DECIDED', async () => {
    const c = await caseFor('You are a worthless idiot');
    const second = await createUser('senior_moderator');
    const body = { kind: 'approve', analysisId: c.analysisId };
    // Two moderators at once: the row lock lets exactly one win.
    const [a, b] = await Promise.all([
      decideAs(moderatorCookie, c.caseId, body),
      decideAs(await sessionCookieFor(second.id), c.caseId, body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect((await readJson<ErrorBody>(loser)).error.code).toBe('ALREADY_DECIDED');
    expect(await getDb().decision.count()).toBe(1);
  });

  it('[HUM-7] an admin cannot decide (403), and nothing is stored', async () => {
    const c = await caseFor('You are a worthless idiot');
    const admin = await createUser('admin');
    const res = await decideAs(await sessionCookieFor(admin.id), c.caseId, {
      kind: 'approve',
      analysisId: c.analysisId,
    });
    expect(res.status).toBe(403);
    expect(await getDb().decision.count()).toBe(0);
    expect((await getDb().case.findUniqueOrThrow({ where: { id: c.caseId } })).status).toBe('awaiting_review');
  });
});

describe('setVisibility and the database guards', () => {
  it('[HUM-1] setVisibility refuses a system actor with HUMAN_REQUIRED', async () => {
    const c = await caseFor('You are a worthless idiot');
    const attempt = getDb().$transaction((tx) =>
      setVisibility(tx, {
        contentId: c.contentId,
        visibility: 'removed',
        actor: { type: 'system', id: null },
        caseId: c.caseId,
        decisionId: 'none',
        policyVersion: 1,
        requestId: 'req-system-0001',
      }),
    );
    await expect(attempt).rejects.toMatchObject({ code: 'HUMAN_REQUIRED' });
    expect(await visibilityOf(c.contentId)).toBe('visible');
  });

  it('[HUM-1] setVisibility refuses a human who is not a moderator', async () => {
    const c = await caseFor('You are a worthless idiot');
    for (const role of ['author', 'admin'] as const) {
      const user = await createUser(role);
      const attempt = getDb().$transaction((tx) =>
        setVisibility(tx, {
          contentId: c.contentId,
          visibility: 'removed',
          actor: actorFor(user),
          caseId: c.caseId,
          decisionId: 'none',
          policyVersion: 1,
          requestId: 'req-human-0001',
        }),
      );
      await expect(attempt).rejects.toMatchObject({ code: 'HUMAN_REQUIRED' });
    }
  });

  it('[HUM-1] a direct UPDATE of visibility without the session flag is refused by the database', async () => {
    const c = await caseFor('You are a worthless idiot');
    await expect(
      getDb().content.update({ where: { id: c.contentId }, data: { visibility: 'removed' } }),
    ).rejects.toThrow(/HUM-1/);
    await expect(
      getDb().$executeRaw`UPDATE "Content" SET "visibility" = 'removed' WHERE "id" = ${c.contentId}`,
    ).rejects.toThrow(/HUM-1/);
    // The flag is transaction-local: setting it in one transaction does not open the door for the next.
    await getDb().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.actor_type', 'human', true)`;
    });
    await expect(
      getDb().content.update({ where: { id: c.contentId }, data: { visibility: 'removed' } }),
    ).rejects.toThrow(/HUM-1/);
    expect(await visibilityOf(c.contentId)).toBe('visible');
  });

  /** A raw UPDATE in a transaction that sets the human flag and (optionally) app.actor_id, bypassing setVisibility. */
  function rawChangeAs(contentId: string, actorId: string | null) {
    return getDb().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.actor_type', 'human', true)`;
      if (actorId !== null) await tx.$queryRaw`SELECT set_config('app.actor_id', ${actorId}, true)`;
      await tx.$executeRaw`UPDATE "Content" SET "visibility" = 'removed' WHERE "id" = ${contentId}`;
    });
  }

  it("[HUM-1] the human flag with an author's id, an admin's id or no id is refused by the database", async () => {
    const c = await caseFor('You are a worthless idiot');
    const author = await createUser('author');
    const admin = await createUser('admin');
    await expect(rawChangeAs(c.contentId, null)).rejects.toThrow(/HUM-1: content visibility change names no actor/);
    for (const id of [author.id, admin.id, 'no-such-user']) {
      await expect(rawChangeAs(c.contentId, id)).rejects.toThrow(
        /HUM-1: only a moderator or senior moderator can change content visibility/,
      );
    }
    expect(await visibilityOf(c.contentId)).toBe('visible');
  });

  it("[HUM-1] the human flag with a senior moderator's id passes the database's role check", async () => {
    const c = await caseFor('You are a worthless idiot');
    const senior = await createUser('senior_moderator');
    await rawChangeAs(c.contentId, senior.id);
    expect(await visibilityOf(c.contentId)).toBe('removed');
  });

  it('[APP-5] an appeal resolution still changes visibility through the role-checked trigger', async () => {
    const author = await createUser('author');
    const created = await createPost(actorFor(author), { body: 'Hey you worthless idiot' }, 'req-decide-0002');
    await runPendingJobs();
    const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
    const decided = await decideAs(moderatorCookie, kase.id, { kind: 'approve', analysisId: kase.currentAnalysisId });
    const { data } = await readJson<DecisionBody>(decided);
    expect(await visibilityOf(created.id)).toBe('labeled');

    const { appealId } = await createAppeal(
      actorFor(author),
      data.decisionId,
      { statement: 'It was a joke between two friends, nobody was hurt.', evidenceLinks: [], evidenceNote: null },
      'req-appeal-0001',
    );
    const senior = await createUser('senior_moderator');
    const resolved = await resolveAppeal(
      actorFor(senior),
      appealId,
      { outcome: 'overturn', rationale: 'Context shows friendly banter.' },
      'req-appeal-0002',
    );
    expect(resolved).toMatchObject({ finalAction: 'none', visibility: 'visible' });
    expect(await visibilityOf(created.id)).toBe('visible');
  });

  it('[AUD-2] decisions are insert-only: UPDATE and DELETE are rejected by the database', async () => {
    const c = await caseFor('You are a worthless idiot');
    await decideAs(moderatorCookie, c.caseId, { kind: 'approve', analysisId: c.analysisId });
    const decision = await getDb().decision.findFirstOrThrow();
    await expect(
      getDb().decision.update({ where: { id: decision.id }, data: { finalAction: 'none' } }),
    ).rejects.toThrow(/insert-only/);
    await expect(getDb().decision.delete({ where: { id: decision.id } })).rejects.toThrow(/insert-only/);
    expect((await getDb().decision.findFirstOrThrow()).finalAction).toBe('label');
  });
});
