import { z } from 'zod';

// Environment contract: docs/02-system-design.md sec. 10. Each slice adds the variables it starts to use.

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export const SESSION_SECRET_MIN_LENGTH = 32;
export const CRON_SECRET_MIN_LENGTH = 16;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  SESSION_SECRET: z.string().min(SESSION_SECRET_MIN_LENGTH),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  VERCEL_GIT_COMMIT_SHA: z.string().min(1).optional(),
  BUILD_TIME: z.string().min(1).optional(),
  // Jobs (S2, docs/02-system-design.md sec. 6).
  JOB_LEASE_MS: z.coerce.number().int().min(1000).max(900_000).default(120_000),
  JOB_BUDGET_MS: z.coerce.number().int().min(1000).max(300_000).default(50_000),
  // The external cron's shared secret for GET /api/jobs/tick. Optional: a missing or short value (such as the
  // .env.example placeholder) only disables the tick; it never stops the app from starting.
  CRON_SECRET: z.string().optional(),
  // Appeals (S5, APP-1): how long after a decision its author may appeal.
  APPEAL_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(14),
});

// Error messages describe what is expected, never the value that was supplied: a misconfigured
// DATABASE_URL or key must not end up in logs or on screen.
const EXPECTED: Record<string, string> = {
  NODE_ENV: 'development, test or production',
  DATABASE_URL: 'a postgres:// or postgresql:// URL',
  SESSION_SECRET: `at least ${SESSION_SECRET_MIN_LENGTH} characters`,
  DEMO_MODE: 'true or false',
  LOG_LEVEL: LOG_LEVELS.join(', '),
  VERCEL_GIT_COMMIT_SHA: 'a non-empty commit SHA',
  BUILD_TIME: 'a non-empty timestamp',
  JOB_LEASE_MS: 'milliseconds between 1000 and 900000',
  JOB_BUDGET_MS: 'milliseconds between 1000 and 300000',
  APPEAL_WINDOW_DAYS: 'a whole number of days between 1 and 365',
};

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  sessionSecret: string;
  /** One-click demo sign-in and the "Switch demo user" menu (UX-5). */
  demoMode: boolean;
  logLevel: LogLevel;
  release: {
    commitSha: string | null;
    buildTime: string | null;
  };
  jobs: {
    /** How long a claimed job is locked before another runner may re-claim it (OPS-4). */
    leaseMs: number;
    /** Wall-clock budget of one runner tick, under the route's maxDuration. */
    budgetMs: number;
    /** The x-cron-secret value GET /api/jobs/tick accepts; null disables the tick. */
    cronSecret: string | null;
  };
  appeals: {
    /** APP-1: an appeal must arrive within this many days of the decision. */
    windowDays: number;
  };
}

export class ConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(
      `Invalid environment configuration: ${variables
        .map((name) => `${name} must be ${EXPECTED[name] ?? 'valid'}`)
        .join('; ')}. See .env.example.`,
    );
    this.name = 'ConfigError';
  }
}

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')))];
    throw new ConfigError(variables);
  }
  const value = result.data;
  return {
    nodeEnv: value.NODE_ENV,
    databaseUrl: value.DATABASE_URL,
    sessionSecret: value.SESSION_SECRET,
    demoMode: value.DEMO_MODE === 'true',
    logLevel: value.LOG_LEVEL,
    release: {
      commitSha: value.VERCEL_GIT_COMMIT_SHA ?? null,
      buildTime: value.BUILD_TIME ?? null,
    },
    jobs: {
      leaseMs: value.JOB_LEASE_MS,
      budgetMs: value.JOB_BUDGET_MS,
      cronSecret: value.CRON_SECRET && value.CRON_SECRET.length >= CRON_SECRET_MIN_LENGTH ? value.CRON_SECRET : null,
    },
    appeals: { windowDays: value.APPEAL_WINDOW_DAYS },
  };
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  // BUILD_TIME is read by its literal name so Next.js can inline it at build time (next.config.ts).
  cached ??= parseConfig({ ...process.env, BUILD_TIME: process.env.BUILD_TIME });
  return cached;
}

/** Integration tests change process.env (for example DEMO_MODE) and re-read the configuration. */
export function resetConfigForTests(): void {
  cached = undefined;
}
