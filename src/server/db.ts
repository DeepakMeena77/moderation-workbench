import { PrismaClient } from '@prisma/client';
import { getConfig } from './config';

// One client per process. In development, Next.js reloads modules, so the client is kept on globalThis to
// avoid opening a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ datasourceUrl: getConfig().databaseUrl });
  }
  return globalForPrisma.prisma;
}
