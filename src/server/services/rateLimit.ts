import { getDb } from '../db';
import { AppError } from '../errors';

// Database-backed fixed-window rate limits (SEC-4, docs/02-system-design.md sec. 10). One atomic upsert
// per attempt, so concurrent serverless instances share the same counter.

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterS: number;
}

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const rows = await getDb().$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  const retryAfterS = Math.max(1, Math.ceil((windowStart.getTime() + rule.windowMs - now.getTime()) / 1000));
  return { allowed: count <= rule.limit, count, retryAfterS };
}

/** "40 seconds" or "15 minutes", for 429 messages (docs/03-ui-ux.md sec. 7). */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Throws 429 RATE_LIMITED (with retryAfterS for the Retry-After header) once the window is used up. */
export async function enforceRateLimit(
  key: string,
  rule: RateLimitRule,
  message: (wait: string) => string,
  now: Date = new Date(),
): Promise<void> {
  const result = await consumeRateLimit(key, rule, now);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', message(formatWait(result.retryAfterS)), {
      retryAfterS: result.retryAfterS,
    });
  }
}
