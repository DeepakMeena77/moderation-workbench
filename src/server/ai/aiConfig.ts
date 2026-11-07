import { z } from 'zod';

// AI and moderation settings (docs/02-system-design.md sec. 5.3 and sec. 10). Kept apart from config.ts so the AI
// core can be built and tested without the database settings. Defaults are the documented bounds.

const int = (min: number, max: number, fallback: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const price = z.coerce.number().min(0).max(1000).optional();
const ratio = (fallback: number) => z.coerce.number().min(0).max(1).default(fallback);

const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(['gemini', 'mock']).default('mock'),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
    // An empty value turns the fallback model off.
    GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash'),
    AI_MAX_CALLS_PER_DAY: int(0, 100_000, 200),
    AI_TIMEOUT_MS: int(100, 120_000, 12_000),
    AI_DEADLINE_MS: int(100, 300_000, 25_000),
    AI_MAX_ATTEMPTS: int(1, 5, 3),
    // AI-9: at most one repair call. 0 turns repair off.
    AI_MAX_REPAIRS: int(0, 1, 1),
    AI_MIN_INTERVAL_MS: int(0, 60_000, 4_000),
    AI_MAX_INPUT_TOKENS: int(500, 100_000, 6_000),
    AI_MAX_OUTPUT_TOKENS: int(256, 65_536, 2_048),
    AI_PRICE_INPUT_PER_MTOK: price,
    AI_PRICE_OUTPUT_PER_MTOK: price,
    AUTO_CLEAR_ENABLED: z.enum(['true', 'false']).default('true'),
    AUTO_CLEAR_MIN_CONFIDENCE: ratio(0.85),
    HUMAN_CONFIDENCE_THRESHOLD: ratio(0.7),
  })
  .superRefine((value, ctx) => {
    // Real calls must be costed (AI-10), so a live provider needs both prices. The mock costs nothing.
    if (value.AI_PROVIDER !== 'gemini') return;
    for (const key of ['AI_PRICE_INPUT_PER_MTOK', 'AI_PRICE_OUTPUT_PER_MTOK'] as const) {
      if (value[key] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'required' });
    }
  });

// Messages describe what is expected, never the supplied value, so a key can never reach a log.
const EXPECTED: Record<string, string> = {
  AI_PROVIDER: 'gemini or mock',
  GEMINI_API_KEY: 'a non-empty key',
  GEMINI_MODEL: 'a model id',
  GEMINI_FALLBACK_MODEL: 'a model id or empty',
  AI_MAX_CALLS_PER_DAY: 'an integer from 0 to 100000',
  AI_TIMEOUT_MS: 'an integer from 100 to 120000',
  AI_DEADLINE_MS: 'an integer from 100 to 300000',
  AI_MAX_ATTEMPTS: 'an integer from 1 to 5',
  AI_MAX_REPAIRS: '0 or 1',
  AI_MIN_INTERVAL_MS: 'an integer from 0 to 60000',
  AI_MAX_INPUT_TOKENS: 'an integer from 500 to 100000',
  AI_MAX_OUTPUT_TOKENS: 'an integer from 256 to 65536',
  AI_PRICE_INPUT_PER_MTOK: 'a number, USD per million input tokens (required when AI_PROVIDER=gemini)',
  AI_PRICE_OUTPUT_PER_MTOK: 'a number, USD per million output tokens (required when AI_PROVIDER=gemini)',
  AUTO_CLEAR_ENABLED: 'true or false',
  AUTO_CLEAR_MIN_CONFIDENCE: 'a number from 0 to 1',
  HUMAN_CONFIDENCE_THRESHOLD: 'a number from 0 to 1',
};

/** Retry delays: 1 s, 2 s, ... with jitter, never above the cap. A server hint is honoured up to the cap. */
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 10_000;

export interface AiBounds {
  maxCallsPerDay: number;
  timeoutMs: number;
  deadlineMs: number;
  maxAttempts: number;
  maxRepairs: number;
  minIntervalMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export interface AiPrices {
  inputPerMTok: number;
  /** Thinking tokens are billed as output tokens. */
  outputPerMTok: number;
}

export interface ModerationSettings {
  autoClearEnabled: boolean;
  autoClearMinConfidence: number;
  humanConfidenceThreshold: number;
}

export interface AiConfig {
  provider: 'gemini' | 'mock';
  geminiApiKey: string | null;
  primaryModel: string;
  fallbackModel: string | null;
  bounds: AiBounds;
  prices: AiPrices;
  moderation: ModerationSettings;
}

export class AiConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(
      `Invalid AI configuration: ${variables
        .map((name) => `${name} must be ${EXPECTED[name] ?? 'valid'}`)
        .join('; ')}. See .env.example.`,
    );
    this.name = 'AiConfigError';
  }
}

export function parseAiConfig(env: Record<string, string | undefined>): AiConfig {
  // An empty variable means "not set", so the documented default applies. Only the fallback model keeps an
  // explicit empty value, which turns it off.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const result = aiEnvSchema.safeParse({ ...cleaned, GEMINI_FALLBACK_MODEL: env.GEMINI_FALLBACK_MODEL });
  if (!result.success) {
    throw new AiConfigError([...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')))]);
  }
  const v = result.data;
  const fallback = v.GEMINI_FALLBACK_MODEL.trim();
  return {
    provider: v.AI_PROVIDER,
    geminiApiKey: v.GEMINI_API_KEY ?? null,
    primaryModel: v.GEMINI_MODEL,
    fallbackModel: fallback === '' || fallback === v.GEMINI_MODEL ? null : fallback,
    bounds: {
      maxCallsPerDay: v.AI_MAX_CALLS_PER_DAY,
      timeoutMs: v.AI_TIMEOUT_MS,
      deadlineMs: v.AI_DEADLINE_MS,
      maxAttempts: v.AI_MAX_ATTEMPTS,
      maxRepairs: v.AI_MAX_REPAIRS,
      minIntervalMs: v.AI_MIN_INTERVAL_MS,
      maxInputTokens: v.AI_MAX_INPUT_TOKENS,
      maxOutputTokens: v.AI_MAX_OUTPUT_TOKENS,
      retryBaseDelayMs: RETRY_BASE_DELAY_MS,
      retryMaxDelayMs: RETRY_MAX_DELAY_MS,
    },
    prices: {
      inputPerMTok: v.AI_PRICE_INPUT_PER_MTOK ?? 0,
      outputPerMTok: v.AI_PRICE_OUTPUT_PER_MTOK ?? 0,
    },
    moderation: {
      autoClearEnabled: v.AUTO_CLEAR_ENABLED === 'true',
      autoClearMinConfidence: v.AUTO_CLEAR_MIN_CONFIDENCE,
      humanConfidenceThreshold: v.HUMAN_CONFIDENCE_THRESHOLD,
    },
  };
}

let cached: AiConfig | undefined;

export function getAiConfig(): AiConfig {
  cached ??= parseAiConfig(process.env);
  return cached;
}
