import { Prisma, type PrismaClient } from '@prisma/client';
import type { AiRunRecord, AiRunSink, CallCounter } from '../ai/aiRun';

// Database side of the AI layer's ports (src/server/ai/aiRun.ts): one insert-only AiRun row per pipeline run
// (AI-10), and the daily call count for AI_MAX_CALLS_PER_DAY, read from those rows (02 sec. 5.3).

type Db = Pick<PrismaClient, 'aiRun'>;

export function createDbAiRunSink(db: Db): AiRunSink {
  return {
    async write(record: AiRunRecord): Promise<string> {
      const row = await db.aiRun.create({
        data: { ...record, costUsd: new Prisma.Decimal(record.costUsd.toFixed(6)) },
        select: { id: true },
      });
      return row.id;
    },
  };
}

/** Midnight UTC of the given instant. The day boundary is UTC so it does not move with the server's time zone. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Provider calls made today: the sum of `attempts` (retries, fallback and repair included) since midnight UTC. */
export function createDbCallCounter(db: Db, now: () => Date = () => new Date()): CallCounter {
  return {
    async callsToday(): Promise<number> {
      const total = await db.aiRun.aggregate({
        where: { createdAt: { gte: startOfUtcDay(now()) } },
        _sum: { attempts: true },
      });
      return total._sum.attempts ?? 0;
    },
  };
}
