import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAiConfig } from '@/server/ai/aiConfig';

// .env.example is the setup path in the README: copied as is, it must start the app with the mock provider.

const env = Object.fromEntries(
  readFileSync('.env.example', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

describe('.env.example', () => {
  it('[OPS-3] parses as a valid AI configuration with the mock provider and the documented models', () => {
    const config = parseAiConfig(env);
    expect(config.primaryModel).toBe('gemini-3.5-flash-lite');
    expect(config.fallbackModel).toBe('gemini-3.6-flash');
  });

  it('[OPS-3] also parses with the live provider once a key is set, because the prices are filled in', () => {
    expect(() => parseAiConfig({ ...env, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' })).not.toThrow();
  });
});
