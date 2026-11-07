import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage } from '@/server/ai/aiRun';
import { estimateCostUsd } from '@/server/ai/cost';
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
