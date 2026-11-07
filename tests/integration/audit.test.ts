import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/server/db';
import { runAnalyzeJob } from '@/server/jobs/handlers';
import { createPost } from '@/server/services/content';
import { actorFor, installPolicy } from './helpers/moderation';
import { createUser } from './helpers/users';

// AUD-2: insert-only tables. A database trigger (forbid_mutation) rejects UPDATE and DELETE. S3 covers Analysis
// and AiRun; S4 (Decision) and S7 (AuditEvent) add theirs here.

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
