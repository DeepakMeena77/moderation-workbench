import type { Logger } from 'pino';
import type { z } from 'zod';
import type { AiBounds } from './aiConfig';
import { formatIssues } from './output';
import { parseModelJson, type ParseStrategy } from './parse';
import {
  ProviderError,
  ZERO_USAGE,
  addUsage,
  isTransient,
  type AiProvider,
  type GenerateJsonRequest,
  type GenerateJsonResponse,
  type TokenUsage,
} from './provider';
import type { AiStatus } from './types';

// The bounded pipeline shared by classify and (later) the appeal brief (docs/02-system-design.md sec. 5.3, AI-9):
// deadline -> daily budget -> pacing -> one call with a hard timeout -> retry transient errors with back-off ->
// fallback model -> parse ladder -> Zod -> at most one repair on the same model -> stop.

export type AiLogger = Pick<Logger, 'info' | 'warn'>;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** In [0, 1); used for back-off jitter. */
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

/** Spaces calls by AI_MIN_INTERVAL_MS to stay under the free tier's requests per minute. Per instance only. */
export class Pacer {
  private lastCallAt: number | null = null;

  delayFor(now: number, minIntervalMs: number): number {
    return this.lastCallAt === null ? 0 : Math.max(0, this.lastCallAt + minIntervalMs - now);
  }

  mark(now: number): void {
    this.lastCallAt = now;
  }
}

export const sharedPacer = new Pacer();

/** Ends a run early. The status goes on the AiRun; the job still succeeds with a degraded analysis. */
export class PipelineStop extends Error {
  constructor(
    readonly status: Exclude<AiStatus, 'ok'>,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PipelineStop';
  }
}

export interface PipelineDeps {
  provider: AiProvider;
  bounds: AiBounds;
  clock: Clock;
  pacer: Pacer;
  logger: AiLogger;
  requestId: string | null;
}

/** What one run has spent so far. Everything on the AiRun except the result comes from here. */
export class RunState {
  attempts = 0;
  usage: TokenUsage = ZERO_USAGE;
  modelsTried: string[] = [];
  lastModel: string | null = null;
  fallbackUsed = false;
  repairUsed = false;
  parseStrategy: ParseStrategy | null = null;
  readonly startedAt: number;
  readonly deadlineAt: number;

  constructor(
    clock: Clock,
    deadlineMs: number,
    /** Calls made today before this run started (daily budget). */
    readonly callsBefore: number,
  ) {
    this.startedAt = clock.now();
    this.deadlineAt = this.startedAt + deadlineMs;
  }
}

/**
 * Delay before retry number `attempt` (1-based): base * 2^(attempt-1), jittered by +-25%, never above the cap.
 * A server hint within the cap is used as given.
 */
export function backoffDelayMs(attempt: number, bounds: AiBounds, random: number, hintMs?: number): number {
  if (hintMs !== undefined && hintMs >= 0 && hintMs <= bounds.retryMaxDelayMs) return hintMs;
  const exponential = bounds.retryBaseDelayMs * 2 ** (attempt - 1);
  const jittered = exponential * (0.75 + 0.5 * random);
  return Math.round(Math.min(bounds.retryMaxDelayMs, jittered));
}

/**
 * One provider call with a hard timeout. The race means a provider that ignores the abort signal still cannot
 * hold the pipeline past the timeout.
 */
export async function callWithTimeout(
  provider: AiProvider,
  request: Omit<GenerateJsonRequest, 'signal'>,
): Promise<GenerateJsonResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError('timeout', `No response within ${request.timeoutMs} ms`));
    }, request.timeoutMs);
  });
  try {
    return await Promise.race([provider.generateJson({ ...request, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function asProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  return new ProviderError('network', error instanceof Error ? error.name : 'unknown provider failure');
}

function stopFromExhausted(error: ProviderError | null): PipelineStop {
  if (!error) return new PipelineStop('unavailable', 'no_model', 'No model available');
  const code = error.status ? `http_${error.status}` : error.kind;
  if (error.kind === 'timeout') return new PipelineStop('timeout', code, error.message);
  if (error.kind === 'rate_limited') return new PipelineStop('rate_limited', code, error.message);
  return new PipelineStop('unavailable', code, error.message);
}

async function beforeCall(deps: PipelineDeps, state: RunState): Promise<void> {
  const { clock, bounds } = deps;
  if (clock.now() >= state.deadlineAt) {
    throw new PipelineStop('timeout', 'deadline_exceeded', `No new attempt after the ${bounds.deadlineMs} ms deadline`);
  }
  if (state.callsBefore + state.attempts >= bounds.maxCallsPerDay) {
    throw new PipelineStop(
      'budget_exhausted',
      'daily_budget',
      `Daily limit of ${bounds.maxCallsPerDay} AI calls reached`,
    );
  }
  const wait = deps.pacer.delayFor(clock.now(), bounds.minIntervalMs);
  if (wait > 0) {
    if (clock.now() + wait >= state.deadlineAt) {
      throw new PipelineStop('timeout', 'deadline_exceeded', 'Pacing would pass the deadline');
    }
    await clock.sleep(wait);
  }
  deps.pacer.mark(clock.now());
}

type CallBase = Pick<GenerateJsonRequest, 'system' | 'user' | 'schema'>;

/**
 * Tries each model in order. Transient errors are retried up to AI_MAX_ATTEMPTS per model; a retired model (404),
 * a spent daily quota or a retry hint above the cap moves straight to the next model. 400/401/403 stop at once.
 */
export async function callModelChain(
  deps: PipelineDeps,
  state: RunState,
  base: CallBase,
  models: readonly string[],
): Promise<{ response: GenerateJsonResponse; model: string }> {
  const { provider, bounds, clock, logger } = deps;
  let lastError: ProviderError | null = null;

  for (let m = 0; m < models.length; m++) {
    const model = models[m] as string;
    if (m > 0) {
      state.fallbackUsed = true;
      logger.warn(
        { event: 'ai.fallback', requestId: deps.requestId, from: models[m - 1], to: model, cause: lastError?.kind },
        'switching to the fallback model',
      );
    }

    for (let attempt = 1; attempt <= bounds.maxAttempts; attempt++) {
      await beforeCall(deps, state);
      state.attempts++;
      state.lastModel = model;
      if (!state.modelsTried.includes(model)) state.modelsTried.push(model);
      const timeoutMs = Math.max(1, Math.min(bounds.timeoutMs, state.deadlineAt - clock.now()));
      const callStart = clock.now();

      try {
        const response = await callWithTimeout(provider, {
          ...base,
          model,
          timeoutMs,
          maxOutputTokens: bounds.maxOutputTokens,
        });
        state.usage = addUsage(state.usage, response.usage);
        logger.info(
          {
            event: 'ai.call',
            requestId: deps.requestId,
            model,
            attempt,
            ok: true,
            latencyMs: clock.now() - callStart,
            finishReason: response.finishReason,
            usage: response.usage,
          },
          'ai call',
        );
        if (response.finishReason === 'MAX_TOKENS') {
          logger.warn({ event: 'ai.output_truncated', requestId: deps.requestId, model }, 'output hit the token cap');
        }
        return { response, model };
      } catch (error) {
        const err = asProviderError(error);
        lastError = err;
        logger.warn(
          {
            event: 'ai.call',
            requestId: deps.requestId,
            model,
            attempt,
            ok: false,
            kind: err.kind,
            status: err.status,
            latencyMs: clock.now() - callStart,
          },
          'ai call failed',
        );
        if (err.kind === 'client') {
          throw new PipelineStop('provider_error', err.status ? `http_${err.status}` : 'client', err.message);
        }
        if (!isTransient(err) || attempt >= bounds.maxAttempts) break;
        if (err.retryAfterMs !== undefined && err.retryAfterMs > bounds.retryMaxDelayMs) break;
        const delay = backoffDelayMs(attempt, bounds, clock.random(), err.retryAfterMs);
        if (clock.now() + delay >= state.deadlineAt) {
          throw new PipelineStop('timeout', 'deadline_exceeded', 'The next retry would start after the deadline');
        }
        logger.info({ event: 'ai.retry', requestId: deps.requestId, model, attempt, delayMs: delay }, 'retrying');
        await clock.sleep(delay);
      }
    }
  }
  throw stopFromExhausted(lastError);
}

export interface StructuredCall<T> {
  system: string;
  user: string;
  responseSchema: Record<string, unknown>;
  outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** The repair message: the original request plus the previous output and the exact error paths. */
  buildRepairUser(previousText: string, errors: string[]): string;
}

type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function check<T>(deps: PipelineDeps, state: RunState, call: StructuredCall<T>, text: string): Checked<T> {
  const parsed = parseModelJson(text);
  if (!parsed.ok) {
    state.parseStrategy = null;
    return { ok: false, errors: [`(root): ${parsed.error.message}`] };
  }
  state.parseStrategy = parsed.strategy;
  if (parsed.strategy !== 'direct') {
    deps.logger.info(
      { event: 'ai.parse_fallback', requestId: deps.requestId, strategy: parsed.strategy },
      'parsed with a fallback strategy',
    );
  }
  const validated = call.outputSchema.safeParse(parsed.value);
  return validated.success ? { ok: true, value: validated.data } : { ok: false, errors: formatIssues(validated.error) };
}

/** Call, parse and validate; on invalid output make at most AI_MAX_REPAIRS (<= 1) repair call on the same model. */
export async function runStructured<T>(
  deps: PipelineDeps,
  state: RunState,
  call: StructuredCall<T>,
  models: readonly string[],
): Promise<T> {
  const base = { system: call.system, schema: call.responseSchema };
  const first = await callModelChain(deps, state, { ...base, user: call.user }, models);
  const firstCheck = check(deps, state, call, first.response.text);
  if (firstCheck.ok) return firstCheck.value;

  deps.logger.warn(
    { event: 'ai.output_invalid', requestId: deps.requestId, model: first.model, errors: firstCheck.errors.length },
    'model output failed validation',
  );
  if (deps.bounds.maxRepairs < 1) {
    throw new PipelineStop('invalid_output', 'invalid_output', firstCheck.errors.join('; '));
  }

  state.repairUsed = true;
  deps.logger.info({ event: 'ai.repair', requestId: deps.requestId, model: first.model }, 'one repair call');
  const repairUser = call.buildRepairUser(first.response.text, firstCheck.errors);
  const second = await callModelChain(deps, state, { ...base, user: repairUser }, [first.model]);
  const secondCheck = check(deps, state, call, second.response.text);
  if (secondCheck.ok) return secondCheck.value;
  throw new PipelineStop('invalid_output', 'invalid_after_repair', secondCheck.errors.join('; '));
}
