import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { GET as versionRoute } from '@/app/api/policies/[version]/route';
import { GET as compareRoute } from '@/app/api/policies/compare/route';
import { GET as draftsRoute } from '@/app/api/policies/drafts/route';
import { GET as listRoute, POST as publishRoute } from '@/app/api/policies/route';
import { POST as validateRoute } from '@/app/api/policies/validate/route';
import { getDb } from '@/server/db';
import { runPendingJobs } from '@/server/jobs/runner';
import { getCase } from '@/server/services/cases';
import { createPost } from '@/server/services/content';
import { decide } from '@/server/services/decisions';
import { getContentHistory } from '@/server/services/history';
import {
  comparePolicies,
  getActivePolicy,
  parsePolicyText,
  policyChangeNotice,
  publishPolicy,
  type PolicyComparison,
  type PolicyDraft,
  type PolicyList,
  type PolicyValidation,
} from '@/server/services/policy';
import { actorFor, installPolicy } from './helpers/moderation';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// POL-1: exactly one active policy, enforced by the database (partial unique index), not only by code.

describe('active policy', () => {
  it('[POL-1] a second active policy is rejected by the database', async () => {
    await installPolicy(1, 'active');
    const error = await installPolicy(2, 'active').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    expect(await getDb().policy.count({ where: { status: 'active' } })).toBe(1);
  });

  it('[POL-1] retired versions may be many; the active one is read back with validated clauses', async () => {
    await installPolicy(1, 'retired');
    await installPolicy(2, 'active');
    const active = await getActivePolicy();
    expect(active?.version).toBe(2);
    expect(active?.clauses.map((c) => c.code)).toContain('SCAM-1');
  });

  it('[POL-1] a stored policy row that fails the schema is an error, not silently used', async () => {
    await getDb().policy.create({
      data: { version: 9, status: 'active', clauses: [{ code: 'bad' }], contentHash: 'x' },
    });
    await expect(getActivePolicy()).rejects.toThrow();
  });
});

// POL-2, POL-4, POL-5: validate with paths and a diff preview, admin-only publish, compare and read versions.

const V2_TEXT = readFileSync('policies/policy.v2.json', 'utf8');

async function cookieFor(role: 'author' | 'moderator' | 'admin') {
  const user = await createUser(role);
  return { user, cookie: await sessionCookieFor(user.id) };
}

const post = (path: string, cookie: string, body: unknown) => apiRequest(path, { method: 'POST', cookie, body });

describe('validate and publish', () => {
  it('[POL-2] invalid JSON and schema errors come back with their JSON paths, and nothing is written', async () => {
    await installPolicy(1);
    expect(parsePolicyText('{ "clauses": [ }')).toMatchObject({
      valid: false,
      errors: [{ path: '(root)', message: expect.stringMatching(/^Not valid JSON/) }],
    });

    const v2 = JSON.parse(V2_TEXT) as { clauses: Array<Record<string, unknown>> };
    v2.clauses[1] = { ...v2.clauses[1], defaultAction: 'label' }; // THR-1 allows only limit and remove
    v2.clauses[2] = { ...v2.clauses[2], code: 'HAR-1' }; // duplicate code
    v2.clauses[3] = { ...v2.clauses[3], keyword: ['x'] }; // unknown key
    const { cookie } = await cookieFor('admin');
    const res = await validateRoute(post('/api/policies/validate', cookie, { json: JSON.stringify(v2) }));
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: PolicyValidation }>(res);
    expect(data.valid).toBe(false);
    expect(data.preview).toBeNull();
    expect(data.errors.map((e) => e.path).sort()).toEqual(['clauses.1.defaultAction', 'clauses.2.code', 'clauses.3']);
    expect(await getDb().policy.count()).toBe(1);
  });

  it('[POL-2] a valid paste previews the field-level diff against the active version and the impact', async () => {
    await installPolicy(1);
    const author = await createUser('author');
    await createPost(actorFor(author), { body: 'You are a worthless idiot' }, 'req-policy-0001');
    const { cookie } = await cookieFor('admin');
    const res = await validateRoute(post('/api/policies/validate', cookie, { json: V2_TEXT }));
    const { data } = await readJson<{ data: PolicyValidation }>(res);
    expect(data).toMatchObject({ valid: true, errors: [] });
    expect(data.preview).toMatchObject({
      fromVersion: 1,
      nextVersion: 2,
      sameAsVersion: null,
      impact: { unresolvedCases: 1 },
    });
    expect(data.preview?.diff.added.map((c) => c.code)).toEqual(['SCAM-1']);
    expect(data.preview?.diff.removed).toEqual([]);
    const spam = data.preview?.diff.changed.find((c) => c.code === 'SPAM-1');
    expect(spam?.changes).toContainEqual({ field: 'signals.linkThreshold', before: 3, after: 2 });
    const pii = data.preview?.diff.changed.find((c) => c.code === 'PII-1');
    expect(pii?.changes.map((c) => c.field)).toContain('signals.addressPattern');
    expect(await getDb().policy.count()).toBe(1);
  });

  it('[POL-2] the server assigns the version: a "version" in the paste is ignored', async () => {
    await installPolicy(1);
    const { cookie } = await cookieFor('admin');
    const text = JSON.stringify({ ...(JSON.parse(V2_TEXT) as object), version: 99 });
    const res = await publishRoute(post('/api/policies', cookie, { json: text }));
    expect(res.status).toBe(200);
    expect((await readJson<{ data: { version: number } }>(res)).data.version).toBe(2);
    expect(await getDb().policy.findUnique({ where: { version: 99 } })).toBeNull();
  });

  it('[POL-2] only an admin may validate or publish; an invalid publish is 400 with paths', async () => {
    await installPolicy(1);
    const { cookie: modCookie } = await cookieFor('moderator');
    const body = { json: V2_TEXT };
    expect((await validateRoute(post('/api/policies/validate', modCookie, body))).status).toBe(403);
    expect((await publishRoute(post('/api/policies', modCookie, body))).status).toBe(403);

    const { cookie } = await cookieFor('admin');
    const bad = await publishRoute(post('/api/policies', cookie, { json: '{"clauses": []}' }));
    expect(bad.status).toBe(400);
    expect((await readJson<{ error: { code: string; details: unknown } }>(bad)).error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ path: 'clauses' }],
    });
    expect(await getDb().policy.count()).toBe(1);
  });
});

describe('editor starting points', () => {
  const draft = (source: string, cookie: string) =>
    draftsRoute(apiRequest(`/api/policies/drafts?source=${source}`, { cookie }));

  it('[POL-2] an admin loads the example v2 or the active version as editor text; others get 403', async () => {
    const { cookie } = await cookieFor('admin');
    expect((await draft('active', cookie)).status).toBe(404);

    await installPolicy(1);
    const example = await draft('example', cookie);
    expect(example.status).toBe(200);
    const exampleText = (await readJson<{ data: PolicyDraft }>(example)).data.text;
    expect(JSON.parse(exampleText)).toEqual(JSON.parse(V2_TEXT));

    const active = (await readJson<{ data: PolicyDraft }>(await draft('active', cookie))).data;
    expect(active.source).toBe('active');
    const file = JSON.parse(active.text) as { version: number; clauses: Array<{ code: string }> };
    expect(file.version).toBe(1);
    expect(file.clauses.map((c) => c.code)).toEqual((await getActivePolicy())?.clauses.map((c) => c.code));

    expect((await draft('other', cookie)).status).toBe(400);
    const { cookie: modCookie } = await cookieFor('moderator');
    expect((await draft('example', modCookie)).status).toBe(403);
    expect((await draftsRoute(apiRequest('/api/policies/drafts?source=example'))).status).toBe(401);
  });
});

describe('versions and compare', () => {
  it('[POL-5] any two versions can be compared, in either direction, through the API', async () => {
    await installPolicy(1, 'retired');
    await installPolicy(2, 'active');
    const { cookie } = await cookieFor('author');
    const res = await compareRoute(apiRequest('/api/policies/compare?from=1&to=2', { cookie }));
    expect(res.status).toBe(200);
    const forward = (await readJson<{ data: PolicyComparison }>(res)).data;
    expect(forward.diff.added.map((c) => c.code)).toEqual(['SCAM-1']);
    expect(forward.diff.changed.map((c) => c.code)).toEqual(['PII-1', 'SPAM-1']);
    expect(forward.diff.unchanged).toEqual(['HAR-1', 'THR-1', 'HATE-1', 'SH-1']);

    const back = await comparePolicies(2, 1);
    expect(back.diff.removed.map((c) => c.code)).toEqual(['SCAM-1']);
    expect(back.diff.added).toEqual([]);

    expect((await compareRoute(apiRequest('/api/policies/compare?from=1&to=7', { cookie }))).status).toBe(404);
    expect((await compareRoute(apiRequest('/api/policies/compare?from=x&to=2', { cookie }))).status).toBe(400);
  });

  it('[POL-5] the version list and a version detail are readable by any signed-in user', async () => {
    await installPolicy(1, 'retired');
    await installPolicy(2, 'active');
    const { cookie } = await cookieFor('author');
    const list = (await readJson<{ data: PolicyList }>(await listRoute(apiRequest('/api/policies', { cookie })))).data;
    expect(list.versions.map((v) => [v.version, v.status, v.clauseCount])).toEqual([
      [2, 'active', 7],
      [1, 'retired', 6],
    ]);
    const res = await versionRoute(apiRequest('/api/policies/2', { cookie }));
    expect(res.status).toBe(200);
    const detail = (await readJson<{ data: { clauses: Array<{ code: string }> } }>(res)).data;
    expect(detail.clauses.at(-1)?.code).toBe('SCAM-1');
    expect((await versionRoute(apiRequest('/api/policies/5', { cookie }))).status).toBe(404);
    expect((await listRoute(apiRequest('/api/policies'))).status).toBe(401);
  });
});

describe('policy change since a decision', () => {
  it('[POL-4] a resolved case keeps its v1 analysis after v2 is published, and shows the change notice', async () => {
    await installPolicy(1);
    const author = await createUser('author');
    const created = await createPost(actorFor(author), { body: 'You are a worthless idiot' }, 'req-policy-0002');
    await runPendingJobs();
    const db = getDb();
    // Stands in for decide() (S4): the case is resolved under its v1 analysis.
    await db.case.update({ where: { id: created.caseId }, data: { status: 'resolved' } });
    expect(await policyChangeNotice(1)).toBeNull();

    const admin = await createUser('admin');
    await publishPolicy(actorFor(admin), { json: V2_TEXT }, 'req-policy-0003');
    await runPendingJobs();

    const analyses = await db.analysis.findMany({ where: { caseId: created.caseId } });
    expect(analyses.map((a) => a.policyVersion)).toEqual([1]);
    expect(await policyChangeNotice(1)).toEqual({
      fromVersion: 1,
      toVersion: 2,
      message: 'Policy changed since this decision (v1 -> v2)',
    });
    expect(await policyChangeNotice(2)).toBeNull();
  });

  it('[POL-4] the case page and both history views show the notice on a decision made under an older version', async () => {
    await installPolicy(1);
    const author = await createUser('author');
    const moderator = await createUser('moderator');
    const created = await createPost(actorFor(author), { body: 'You are a worthless idiot' }, 'req-policy-0004');
    await runPendingJobs();
    const kase = await getDb().case.findUniqueOrThrow({ where: { id: created.caseId } });
    await decide(
      actorFor(moderator),
      kase.id,
      { kind: 'approve', analysisId: kase.currentAnalysisId ?? '' },
      'req-policy-0005',
    );

    const decisionEvent = async (viewer: Parameters<typeof getContentHistory>[0]) =>
      (await getContentHistory(viewer, created.id)).events.find((e) => e.kind === 'decision');
    expect((await getCase(actorFor(moderator), kase.id)).decision?.policyChange).toBeNull();
    expect((await decisionEvent(actorFor(author)))?.policyChange).toBeUndefined();

    const admin = await createUser('admin');
    await publishPolicy(actorFor(admin), { json: V2_TEXT }, 'req-policy-0006');

    const notice = { fromVersion: 1, toVersion: 2, message: 'Policy changed since this decision (v1 -> v2)' };
    const detail = await getCase(actorFor(moderator), kase.id);
    expect(detail.decision).toMatchObject({ policyVersion: 1, policyChange: notice });
    expect(await decisionEvent(actorFor(author))).toMatchObject({ policyVersion: 1, policyChange: notice });
    expect(await decisionEvent(actorFor(moderator))).toMatchObject({ policyVersion: 1, policyChange: notice });
  });
});
