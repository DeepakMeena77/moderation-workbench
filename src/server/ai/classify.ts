import { getLogger } from '../logger';
import type { AiConfig } from './aiConfig';
import type { AiRunRecord, AiRunSink, CallCounter } from './aiRun';
import { fitContext } from './budget';
import { pricesForModel } from './cost';
import { GeminiProvider } from './gemini';
import { MockProvider } from './mock';
import { classifyOutputSchema, classifyResponseJsonSchema } from './output';
import {
  buildRunRecord,
  PipelineStop,
  RunState,
  realClock,
  runStructured,
  sharedPacer,
  type AiLogger,
  type Clock,
  type Pacer,
  type PipelineDeps,
} from './pipeline';
import {
  detectInjectionSignals,
  escapeForPrompt,
  loadPrompt,
  type ClassifyContext,
  type LoadedPrompt,
  type TrimmedPart,
} from './prompts';
import { ProviderError, type AiProvider } from './provider';
import type { AiStatus, PolicyView } from './types';
import { verifyOutput, type VerificationReport, type VerifiedOutput } from './verify';

// Classify (docs/02-system-design.md sec. 5.2-5.5, AI-1..11): one bounded pipeline run against the active policy.
// It returns findings for a human to review and an AiRun record. It never decides, changes visibility or resolves
// anything: those paths are not reachable from here (HUM-1).

export const CLASSIFY_PROMPT = { name: 'classify', version: 2 } as const;

export interface ClassifyInput extends ClassifyContext {
  policy: PolicyView;
}

export interface ClassifyDeps {
  provider: AiProvider;
  config: AiConfig;
  sink: AiRunSink;
  callCounter: CallCounter;
  clock?: Clock;
  pacer?: Pacer;
  logger?: AiLogger;
  requestId?: string | null;
  prompt?: LoadedPrompt;
}

export interface ClassifyResult {
  status: AiStatus;
  /** Verified output; null unless status is ok. */
  output: VerifiedOutput | null;
  verification: VerificationReport | null;
  /** AI-8: signs that the content addresses the model. Combine turns them into a "needs human" reason. */
  injectionSignals: string[];
  trimmed: TrimmedPart[];
  /** A plain-language reason when the AI result is missing, for the case page and combine. */
  unavailableReason: string | null;
  aiRunId: string;
  aiRun: AiRunRecord;
}

const PLAIN_REASON: Record<Exclude<AiStatus, 'ok'>, string> = {
  timeout: 'AI did not answer in time - retry later',
  rate_limited: 'AI quota reached - retry later',
  budget_exhausted: 'AI quota reached - retry later',
  invalid_output: 'AI output was invalid even after one repair',
  invalid_input: 'Content and context are too large for the AI budget',
  provider_error: 'AI provider refused the request',
  unavailable: 'AI unavailable - retry later',
};

export function plainReason(status: Exclude<AiStatus, 'ok'>): string {
  return PLAIN_REASON[status];
}

/** The single repair message (AI-9): the original request, the previous output and the exact error paths. */
export function buildRepairUserMessage(originalUser: string, previousText: string, errors: string[]): string {
  return [
    originalUser,
    `<previous_output>\n${escapeForPrompt(previousText.slice(0, 8_000))}\n</previous_output>`,
    `<validation_errors>\n${errors.map((e) => escapeForPrompt(e)).join('\n')}\n</validation_errors>`,
    'Your previous output did not match the required JSON contract. Fix exactly the errors listed above and ' +
      'return only the corrected JSON object, with the same meaning as before.',
  ].join('\n\n');
}

/** Provider for the configured mode. A missing key gives a provider whose calls fail as provider_error. */
export function createAiProvider(config: AiConfig): AiProvider {
  if (config.provider === 'mock') return new MockProvider({ fallbackModel: config.fallbackModel });
  if (config.geminiApiKey) return new GeminiProvider(config.geminiApiKey);
  return {
    name: 'gemini',
    generateJson: async () => {
      throw new ProviderError('client', 'GEMINI_API_KEY is not set');
    },
  };
}

export async function classify(input: ClassifyInput, deps: ClassifyDeps): Promise<ClassifyResult> {
  const clock = deps.clock ?? realClock;
  const logger = deps.logger ?? getLogger();
  const requestId = deps.requestId ?? null;
  const { config } = deps;
  const prompt = deps.prompt ?? loadPrompt(CLASSIFY_PROMPT.name, CLASSIFY_PROMPT.version);
  const injectionSignals = detectInjectionSignals(input.content.text);
  const models = [config.primaryModel, ...(config.fallbackModel ? [config.fallbackModel] : [])];

  const callsBefore = await deps.callCounter.callsToday();
  const state = new RunState(clock, config.bounds.deadlineMs, callsBefore);
  const pipeline: PipelineDeps = {
    provider: deps.provider,
    bounds: config.bounds,
    clock,
    pacer: deps.pacer ?? sharedPacer,
    logger,
    requestId,
  };

  let status: AiStatus = 'ok';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let output: VerifiedOutput | null = null;
  let verification: VerificationReport | null = null;
  let trimmed: TrimmedPart[] = [];

  const budget = fitContext(prompt.text, input.policy, input, config.bounds.maxInputTokens);
  trimmed = budget.trimmed;
  if (trimmed.length > 0) {
    logger.info({ event: 'ai.context_trimmed', requestId, trimmed }, 'optional context trimmed to fit the budget');
  }

  if (!budget.ok) {
    status = 'invalid_input';
    errorCode = budget.reason;
    errorMessage = `Estimated ${budget.estimatedTokens} input tokens; the limit is ${config.bounds.maxInputTokens}`;
  } else if (callsBefore >= config.bounds.maxCallsPerDay) {
    status = 'budget_exhausted';
    errorCode = 'daily_budget';
    errorMessage = `Daily limit of ${config.bounds.maxCallsPerDay} AI calls reached`;
  } else {
    try {
      const raw = await runStructured(
        pipeline,
        state,
        {
          system: prompt.text,
          user: budget.user,
          responseSchema: classifyResponseJsonSchema,
          outputSchema: classifyOutputSchema,
          buildRepairUser: (previous, errors) => buildRepairUserMessage(budget.user, previous, errors),
        },
        models,
      );
      const verified = verifyOutput(raw, input.policy, input.content.text);
      output = verified.output;
      verification = verified.report;
      if (verification.invalidCitations.length > 0) {
        logger.warn(
          { event: 'ai.citation_invalid', requestId, clauses: verification.invalidCitations },
          'AI cited clauses that are not in the policy',
        );
      }
      if (verification.unverifiedQuotes.length > 0) {
        logger.warn(
          { event: 'ai.quote_unverified', requestId, clauses: verification.unverifiedQuotes },
          'AI quotes not found in the content',
        );
      }
      if (verification.actionLowered) {
        logger.info({ event: 'ai.action_lowered', requestId, ...verification.actionLowered }, 'action lowered');
      }
    } catch (error) {
      if (!(error instanceof PipelineStop)) throw error;
      status = error.status;
      errorCode = error.code;
      errorMessage = error.message;
    }
  }

  const record = buildRunRecord({
    purpose: 'classify',
    provider: deps.provider.name,
    primaryModel: config.primaryModel,
    prompt,
    policyVersion: input.policy.version,
    state,
    pricesFor: (model) => pricesForModel(config, model),
    now: clock.now(),
    trimmedContext: trimmed.length > 0,
    outcome: { status, errorCode, errorMessage },
  });
  const aiRunId = await deps.sink.write(record);

  logger.info(
    {
      event: 'ai.run',
      requestId,
      aiRunId,
      status,
      model: record.model,
      attempts: record.attempts,
      repairUsed: record.repairUsed,
      fallbackUsed: record.fallbackUsed,
      parseStrategy: record.parseStrategy,
      costUsd: record.costUsd,
      latencyMs: record.latencyMs,
      injectionSignals,
    },
    'ai run finished',
  );

  return {
    status,
    output,
    verification,
    injectionSignals,
    trimmed,
    unavailableReason: status === 'ok' ? null : plainReason(status),
    aiRunId,
    aiRun: record,
  };
}
