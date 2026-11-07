import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAiConfig } from '@/server/ai/aiConfig';

// AI-9 asks for every bound to be visible in config. .env.example is where a reader sees them, and the README's
// setup path copies it as is, so it must parse, and each bound must arrive in the config with the documented value.

const env = Object.fromEntries(
  readFileSync('.env.example', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

describe('.env.example', () => {
  it('[AI-9] names every AI bound with the documented default, and they reach the parsed config', () => {
    const { bounds } = parseAiConfig(env);
    expect(bounds).toMatchObject({
      maxCallsPerDay: 200,
      timeoutMs: 12_000,
      deadlineMs: 25_000,
      maxAttempts: 3,
      maxRepairs: 1,
      minIntervalMs: 4_000,
      maxInputTokens: 6_000,
      maxOutputTokens: 2_048,
    });
  });

  it('[AI-9] parses with the mock provider and the documented models, so a fresh clone starts', () => {
    const config = parseAiConfig(env);
    expect(config.provider).toBe('mock');
    expect(config.primaryModel).toBe('gemini-3.5-flash-lite');
    expect(config.fallbackModel).toBe('gemini-3.6-flash');
  });

  it('[AI-10] also parses with the live provider once a key is set, because the prices are filled in', () => {
    const config = parseAiConfig({ ...env, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' });
    expect(config.prices).toEqual({ inputPerMTok: 0.3, outputPerMTok: 2.5 });
    expect(config.fallbackPrices).toEqual({ inputPerMTok: 0.75, outputPerMTok: 3.75 });
  });
});
