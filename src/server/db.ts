import { PrismaClient } from '@prisma/client';
import { getConfig } from './config';

// One client per process. In development, Next.js reloads modules, so the client is kept on globalThis to
// avoid opening a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Interactive transactions get more than Prisma's 5 s default: a serverless Postgres that is waking up, or a busy
// host, can take several seconds per round trip, and a transaction that times out rolls back work the user saw
// succeed. Every transaction is still short (the model is never called inside one, 02 sec. 6).
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasourceUrl: getConfig().databaseUrl,
      transactionOptions: TRANSACTION_OPTIONS,
    });
  }
  return globalForPrisma.prisma;
}
