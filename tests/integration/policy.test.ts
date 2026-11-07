import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/server/db';
import { getActivePolicy } from '@/server/services/policy';
import { installPolicy } from './helpers/moderation';

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
