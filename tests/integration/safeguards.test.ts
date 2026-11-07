import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/server/db';
import { runAnalyzeJob } from '@/server/jobs/handlers';
import type { Recommendation } from '@/server/moderation/combine';
import { createPost } from '@/server/services/content';
import { actorFor, installPolicy } from './helpers/moderation';
import { createUser } from './helpers/users';

// AI-6 safeguard, end to end through the analyse job with the mock provider: when verification has to drop a
// finding the model made, the case goes to a human even though everything else about the AI output would allow an
// auto-clear (docs/02-system-design.md sec. 5.6). Each post has its own author, so the near-duplicate rule (DET-4)
// never links them.

const CLEAN = 'Lovely sunny walk along the river this morning, the ducks were out in force.';
const DROPPED_REASON = 'AI made 1 finding with no verifiable quote or explanation (removed).';

beforeEach(async () => {
  await installPolicy(1);
});

async function analyse(body: string) {
  const author = await createUser('author');
  const created = await createPost(actorFor(author), { body }, 'req-safeguard-01');
  await runAnalyzeJob({ caseId: created.caseId, reason: 'initial' });
  const db = getDb();
  const kase = await db.case.findUniqueOrThrow({ where: { id: created.caseId } });
  const analysis = await db.analysis.findUniqueOrThrow({ where: { id: kase.currentAnalysisId ?? '' } });
  const content = await db.content.findUniqueOrThrow({ where: { id: created.id } });
  return { kase, analysis, recommendation: analysis.recommendation as unknown as Recommendation, content };
}

describe('combine safeguard for dropped findings (AI-6)', () => {
  it('[AI-6] control: the same clean post with a confident, empty AI result is auto-cleared', async () => {
    const { kase, analysis, recommendation } = await analyse(CLEAN);
    expect(analysis.aiStatus).toBe('ok');
    expect(recommendation.autoClear).toBe(true);
    expect(kase.status).toBe('auto_cleared');
  });

  it('[AI-6] a finding verification drops (no quote, no interpretation) keeps the case for a human, never auto-cleared', async () => {
    const { kase, analysis, recommendation, content } = await analyse(`${CLEAN} [mock:emptyfinding]`);

    // The AI call itself succeeded; verification removed the empty finding.
    expect(analysis.aiStatus).toBe('ok');
    const stored = analysis.aiFindings as { findings: unknown[]; verification: { droppedFindings: number } };
    expect(stored.findings).toEqual([]);
    expect(stored.verification.droppedFindings).toBe(1);

    expect(recommendation.autoClear).toBe(false);
    expect(recommendation.needsHuman).toBe(true);
    // The only reason: without the safeguard this output would have been auto-cleared, like the control.
    expect(recommendation.reasons).toEqual([DROPPED_REASON]);
    expect(kase.status).toBe('awaiting_review');
    expect(kase.status).not.toBe('auto_cleared');
    // Routing to a human never touches visibility (HUM-1).
    expect(content.visibility).toBe('visible');
  });
});
