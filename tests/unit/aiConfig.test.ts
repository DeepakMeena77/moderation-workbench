import { describe, expect, it } from 'vitest';
import { AiConfigError, parseAiConfig } from '@/server/ai/aiConfig';

describe('AI configuration', () => {
  it('[AI-9] defaults are the documented bounds (docs/02 sec. 5.3)', () => {
    const config = parseAiConfig({});
    expect(config).toMatchObject({
      provider: 'mock',
      primaryModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.5-flash',
      bounds: {
        maxCallsPerDay: 200,
        timeoutMs: 12_000,
        deadlineMs: 25_000,
        maxAttempts: 3,
        maxRepairs: 1,
        minIntervalMs: 4_000,
        maxInputTokens: 6_000,
        maxOutputTokens: 2_048,
        retryBaseDelayMs: 1_000,
        retryMaxDelayMs: 10_000,
      },
      moderation: { autoClearEnabled: true, autoClearMinConfidence: 0.85, humanConfidenceThreshold: 0.7 },
    });
  });

  it('[AI-9] more than one repair call is rejected', () => {
    expect(() => parseAiConfig({ AI_MAX_REPAIRS: '2' })).toThrow(AiConfigError);
  });

  it('[AI-10] the live provider needs prices; the error names the variable, never a value', () => {
    let error: unknown;
    try {
      parseAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'super-secret-value' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AiConfigError);
    expect((error as AiConfigError).variables).toEqual(['AI_PRICE_INPUT_PER_MTOK', 'AI_PRICE_OUTPUT_PER_MTOK']);
    expect((error as Error).message).not.toContain('super-secret-value');
  });

  it('[AI-9] an empty fallback model, or one equal to the primary, turns the fallback off', () => {
    expect(parseAiConfig({ GEMINI_FALLBACK_MODEL: '' }).fallbackModel).toBeNull();
    expect(parseAiConfig({ GEMINI_MODEL: 'm', GEMINI_FALLBACK_MODEL: 'm' }).fallbackModel).toBeNull();
  });

  it('[AI-9] numbers are parsed from strings and bad values are rejected', () => {
    expect(parseAiConfig({ AI_TIMEOUT_MS: '5000' }).bounds.timeoutMs).toBe(5000);
    expect(() => parseAiConfig({ AI_TIMEOUT_MS: 'soon' })).toThrow(/AI_TIMEOUT_MS/);
    expect(() => parseAiConfig({ AUTO_CLEAR_MIN_CONFIDENCE: '1.5' })).toThrow(/AUTO_CLEAR_MIN_CONFIDENCE/);
  });
});
