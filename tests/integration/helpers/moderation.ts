import { readFileSync } from 'node:fs';
import type { User } from '@prisma/client';
import type { Actor } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { policyContentHash, policyFileSchema } from '@/server/policy/schema';

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
