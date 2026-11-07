import { parseAiConfig, type AiBounds, type AiConfig } from '@/server/ai/aiConfig';
import { InMemoryAiRunSink, type CallCounter } from '@/server/ai/aiRun';
import { classify, type ClassifyInput, type ClassifyResult } from '@/server/ai/classify';
import { MockProvider } from '@/server/ai/mock';
import { Pacer, type Clock } from '@/server/ai/pipeline';
import {
  ProviderError,
  type AiProvider,
  type GenerateJsonRequest,
  type GenerateJsonResponse,
} from '@/server/ai/provider';
import type { PolicyView } from '@/server/ai/types';
import { createLogger } from '@/server/logger';

// Shared fixtures for the AI unit tests. The policy mirrors the v1 clause table in docs/02-system-design.md sec. 4;
// S2 owns the real policies/policy.v1.json.

export const POLICY: PolicyView = {
  version: 1,
  clauses: [
    {
      code: 'HAR-1',
      title: 'Harassment and insults',
      text: 'Do not insult, demean or target a person.',
      defaultSeverity: 'medium',
      defaultAction: 'label',
      allowedActions: ['label', 'limit', 'remove'],
      alwaysEscalate: false,
    },
    {
      code: 'THR-1',
      title: 'Threats of violence',
      text: 'Do not threaten violence against anyone.',
      defaultSeverity: 'high',
      defaultAction: 'remove',
      allowedActions: ['limit', 'remove'],
      alwaysEscalate: true,
    },
    {
      code: 'HATE-1',
      title: 'Hate against protected groups',
      text: 'Do not attack people for a protected characteristic.',
      defaultSeverity: 'high',
      defaultAction: 'remove',
      allowedActions: ['label', 'limit', 'remove'],
      alwaysEscalate: false,
    },
    {
      code: 'SH-1',
      title: 'Self-harm (support, not punishment)',
      text: 'Content about self-harm is limited and routed to support.',
      defaultSeverity: 'high',
      defaultAction: 'limit',
      allowedActions: ['label', 'limit'],
      alwaysEscalate: true,
    },
    {
      code: 'PII-1',
      title: 'Private information',
      text: 'Do not share private contact details.',
      defaultSeverity: 'medium',
      defaultAction: 'limit',
      allowedActions: ['limit', 'remove'],
      alwaysEscalate: false,
    },
    {
      code: 'SPAM-1',
      title: 'Spam and link flooding (3+ links)',
      text: 'Do not flood posts with links.',
      defaultSeverity: 'low',
      defaultAction: 'label',
      allowedActions: ['label', 'limit', 'remove'],
      alwaysEscalate: false,
    },
  ],
};

export const PRIMARY = 'gemini-3.5-flash-lite';
export const FALLBACK = 'gemini-3.6-flash';

export const silentLogger = createLogger({ level: 'silent' });

export function testConfig(bounds: Partial<AiBounds> = {}, env: Record<string, string> = {}): AiConfig {
  const base = parseAiConfig({
    AI_PROVIDER: 'mock',
    GEMINI_MODEL: PRIMARY,
    GEMINI_FALLBACK_MODEL: FALLBACK,
    AI_MIN_INTERVAL_MS: '0',
    AI_PRICE_INPUT_PER_MTOK: '0.1',
    AI_PRICE_OUTPUT_PER_MTOK: '0.4',
    ...env,
  });
  return { ...base, bounds: { ...base.bounds, ...bounds } };
}

/** A clock whose sleep advances time instantly, recording each delay. */
export function fakeClock(randomValue = 0.5): Clock & { sleeps: number[]; advance(ms: number): void } {
  let now = 1_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    random: () => randomValue,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

type Step = string | ProviderError | ((request: GenerateJsonRequest) => Promise<GenerateJsonResponse>);

/** Plays a script: each call takes the next step (the last step repeats). Strings are returned as the model text. */
export class ScriptedProvider implements AiProvider {
  readonly name = 'scripted';
  readonly requests: GenerateJsonRequest[] = [];

  constructor(private readonly steps: Step[]) {}

  async generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    this.requests.push(request);
    const step = this.steps[Math.min(this.requests.length - 1, this.steps.length - 1)];
    if (step instanceof ProviderError) throw step;
    if (typeof step === 'function') return step(request);
    const text = step ?? '';
    return {
      text,
      usage: { input: 100, output: 20, thinking: 5 },
      model: request.model,
      finishReason: 'STOP',
    };
  }
}

/** A valid classify output with no findings. */
export const CLEAN_JSON = JSON.stringify({
  findings: [],
  proposedAction: 'none',
  overallSeverity: 'low',
  overallConfidence: 0.95,
  confidenceReason: 'Nothing in the policy applies.',
  needsHumanReview: false,
  humanReviewReasons: [],
  insufficientContext: false,
});

export function input(text: string, extra: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    policy: POLICY,
    content: { id: 'content_1', type: 'post', text },
    parentText: null,
    reportReasons: {},
    ruleFindings: [],
    authorHistory: [],
    ...extra,
  };
}

export interface RunOptions {
  provider?: AiProvider;
  config?: AiConfig;
  clock?: Clock;
  callsToday?: number;
  pacer?: Pacer;
}

export async function runClassify(
  text: string | ClassifyInput,
  options: RunOptions = {},
): Promise<{ result: ClassifyResult; sink: InMemoryAiRunSink; provider: AiProvider }> {
  const sink = new InMemoryAiRunSink();
  const config = options.config ?? testConfig();
  const provider = options.provider ?? new MockProvider({ fallbackModel: config.fallbackModel });
  const callCounter: CallCounter = { callsToday: async () => options.callsToday ?? 0 };
  const result = await classify(typeof text === 'string' ? input(text) : text, {
    provider,
    config,
    sink,
    callCounter,
    clock: options.clock ?? fakeClock(),
    pacer: options.pacer ?? new Pacer(),
    logger: silentLogger,
    requestId: 'req_test',
  });
  return { result, sink, provider };
}
