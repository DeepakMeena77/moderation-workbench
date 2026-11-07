import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage } from '@/server/ai/aiRun';
import { estimateCostUsd, estimateRunCostUsd, pricesForModel } from '@/server/ai/cost';
import { MOCK_THINKING_TOKENS } from '@/server/ai/mock';
import { runClassify, testConfig } from './helpers/ai';

const PRICES = { inputPerMTok: 0.1, outputPerMTok: 0.4 };

describe('cost', () => {
  it('[AI-10] cost = input x input price + (output + thinking) x output price, per million tokens', () => {
    // 1000 x 0.1 + (200 + 300) x 0.4 = 300 micro-dollars
    expect(estimateCostUsd({ input: 1000, output: 200, thinking: 300 }, PRICES)).toBe(0.0003);
  });

  it('[AI-10] thinking tokens alone are charged at the output rate', () => {
    expect(estimateCostUsd({ input: 0, output: 0, thinking: 1_000_000 }, PRICES)).toBe(0.4);
  });

  it('[AI-10] cost is rounded to 6 decimals, like AiRun.costUsd', () => {
    expect(estimateCostUsd({ input: 3, output: 0, thinking: 0 }, PRICES)).toBe(0);
    expect(estimateCostUsd({ input: 7, output: 1, thinking: 1 }, { inputPerMTok: 1, outputPerMTok: 1 })).toBe(0.000009);
  });

  it('[AI-10] a successful run records tokens (thinking included) and cost', async () => {
    const { sink } = await runClassify('You are a worthless idiot');
    const run = sink.records[0];
    expect(run?.thinkingTokens).toBe(MOCK_THINKING_TOKENS);
    expect(run?.costUsd).toBe(
      estimateCostUsd(
        { input: run?.inputTokens ?? 0, output: run?.outputTokens ?? 0, thinking: run?.thinkingTokens ?? 0 },
        PRICES,
      ),
    );
    expect(run?.costUsd).toBeGreaterThan(0);
  });

  it('[AI-10] a failed run still records the tokens and cost of every call', async () => {
    const { sink } = await runClassify('hello [mock:invalid]', { config: testConfig() });
    const run = sink.records[0];
    expect(run?.status).toBe('invalid_output');
    expect(run?.attempts).toBe(2);
    expect(run?.thinkingTokens).toBe(2 * MOCK_THINKING_TOKENS);
    expect(run?.costUsd).toBeGreaterThan(0);
  });

  it('[AI-10] stored error messages are one line, bounded and free of keys', () => {
    const message = sanitizeErrorMessage(`bad key AIza${'x'.repeat(35)}\nat line 2 ${'y'.repeat(400)}`);
    expect(message).not.toContain('AIza');
    expect(message).not.toContain('\n');
    expect(message.length).toBeLessThanOrEqual(300);
  });

  it('[AI-10] the newer AQ. key format is redacted too', () => {
    // Built at runtime so the repository's secret scanner does not see a key-shaped literal.
    const key = ['AQ', 'x'.repeat(45)].join('.');
    expect(sanitizeErrorMessage(`provider said: invalid ${key} for project`)).toBe(
      'provider said: invalid [redacted] for project',
    );
  });
});

describe('fallback model pricing (AI-10)', () => {
  const FALLBACK_ENV = { AI_PRICE_FALLBACK_INPUT_PER_MTOK: '1', AI_PRICE_FALLBACK_OUTPUT_PER_MTOK: '2' };

  it('[AI-10] fallback prices default to the primary prices, each one on its own', () => {
    expect(testConfig().fallbackPrices).toEqual(PRICES);
    expect(testConfig({}, FALLBACK_ENV).fallbackPrices).toEqual({ inputPerMTok: 1, outputPerMTok: 2 });
    expect(testConfig({}, { AI_PRICE_FALLBACK_OUTPUT_PER_MTOK: '2' }).fallbackPrices).toEqual({
      inputPerMTok: 0.1,
      outputPerMTok: 2,
    });
  });

  it('[AI-10] the fallback model is priced at its own prices, every other model at the primary prices', () => {
    const config = testConfig({}, FALLBACK_ENV);
    expect(pricesForModel(config, config.fallbackModel ?? '')).toEqual({ inputPerMTok: 1, outputPerMTok: 2 });
    expect(pricesForModel(config, config.primaryModel)).toEqual(PRICES);
    expect(pricesForModel({ ...config, fallbackModel: null }, 'anything')).toEqual(PRICES);
  });

  it('[AI-10] a run that used two models costs each model at its own prices, rounded once', () => {
    const config = testConfig({}, FALLBACK_ENV);
    const usage = new Map([
      [config.primaryModel, { input: 1000, output: 200, thinking: 300 }],
      [config.fallbackModel ?? '', { input: 1000, output: 100, thinking: 0 }],
    ]);
    // Primary: 1000 x 0.1 + 500 x 0.4 = 300 micro-dollars. Fallback: 1000 x 1 + 100 x 2 = 1200 micro-dollars.
    expect(estimateRunCostUsd(usage, (model) => pricesForModel(config, model))).toBe(0.0015);
  });

  it('[AI-10] a run answered by the fallback model ([mock:404]) is costed at the fallback prices', async () => {
    const config = testConfig({}, FALLBACK_ENV);
    const { sink } = await runClassify('You are a worthless idiot [mock:404]', { config });
    const run = sink.records[0];
    expect(run).toMatchObject({ status: 'ok', fallbackUsed: true, model: config.fallbackModel });
    const tokens = { input: run?.inputTokens ?? 0, output: run?.outputTokens ?? 0, thinking: run?.thinkingTokens ?? 0 };
    expect(run?.costUsd).toBe(estimateCostUsd(tokens, { inputPerMTok: 1, outputPerMTok: 2 }));
    expect(run?.costUsd).not.toBe(estimateCostUsd(tokens, PRICES));
  });

  it('[AI-10] with no fallback prices set, a fallback run is costed exactly as before', async () => {
    const { sink } = await runClassify('You are a worthless idiot [mock:404]', { config: testConfig() });
    const run = sink.records[0];
    expect(run?.fallbackUsed).toBe(true);
    const tokens = { input: run?.inputTokens ?? 0, output: run?.outputTokens ?? 0, thinking: run?.thinkingTokens ?? 0 };
    expect(run?.costUsd).toBe(estimateCostUsd(tokens, PRICES));
  });
});
