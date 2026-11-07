import type { PrismaClient } from '@prisma/client';
import { getDb } from '../db';
import { clausesSchema, type ActivePolicy } from '../policy/schema';
import type { Tx } from './audit';

// Policy reads (POL-1). Publishing and comparing versions arrive in S6. Stored clauses are parsed again on
// read: they were validated on publish, and a bad row must fail loudly rather than feed the rules garbage.

export async function getActivePolicy(db: Tx | PrismaClient = getDb()): Promise<ActivePolicy | null> {
  const row = await db.policy.findFirst({ where: { status: 'active' }, select: { version: true, clauses: true } });
  if (!row) return null;
  return { version: row.version, clauses: clausesSchema.parse(row.clauses) };
}

/** For job handlers: no active policy is a deployment fault (not seeded), so the job retries and then fails. */
export async function requireActivePolicy(db: Tx | PrismaClient = getDb()): Promise<ActivePolicy> {
  const policy = await getActivePolicy(db);
  if (!policy) throw new Error('No active policy. Run npm run db:seed to install policy v1.');
  return policy;
}
