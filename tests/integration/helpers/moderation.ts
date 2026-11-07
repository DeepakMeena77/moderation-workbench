import { readFileSync } from 'node:fs';
import type { User, Visibility } from '@prisma/client';
import type { Actor } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { policyContentHash, policyFileSchema } from '@/server/policy/schema';
import { setVisibility } from '@/server/services/visibility';

// Builders for moderation integration tests: policies from the real files, and actors for calling services.

export async function installPolicy(version: 1 | 2, status: 'active' | 'retired' = 'active') {
  const file = policyFileSchema.parse(JSON.parse(readFileSync(`policies/policy.v${version}.json`, 'utf8')));
  return getDb().policy.create({
    data: {
      version,
      status,
      clauses: file.clauses,
      notes: file.notes ?? null,
      contentHash: policyContentHash(file.clauses),
    },
  });
}

export function actorFor(user: User): Actor {
  return { type: 'human', id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Sets an item's visibility the only way the app can: through setVisibility with a human moderator (HUM-1).
 * For tests that need a labeled or removed item without going through a whole decision.
 */
export async function setVisibilityAs(moderator: User, contentId: string, visibility: Visibility) {
  const kase = await getDb().case.findUniqueOrThrow({ where: { contentId }, select: { id: true } });
  return getDb().$transaction((tx) =>
    setVisibility(tx, {
      contentId,
      visibility,
      actor: actorFor(moderator),
      caseId: kase.id,
      decisionId: 'test-fixture',
      policyVersion: 1,
      requestId: 'req-fixture-0001',
    }),
  );
}
