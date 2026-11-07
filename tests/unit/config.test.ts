import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '@/server/config';

const VALID = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  SESSION_SECRET: 'unit-test-session-secret-placeholder-000',
};

describe('config', () => {
  it('[INFRA] parses a minimal valid environment and applies defaults', () => {
    const config = parseConfig(VALID);
    expect(config.databaseUrl).toBe(VALID.DATABASE_URL);
    expect(config.logLevel).toBe('info');
    expect(config.nodeEnv).toBe('development');
    expect(config.demoMode).toBe(false);
    expect(config.release).toEqual({ commitSha: null, buildTime: null });
  });

  it('[INFRA] reads the release identifier and build time when present', () => {
    const config = parseConfig({ ...VALID, VERCEL_GIT_COMMIT_SHA: 'abc1234', BUILD_TIME: '2026-11-07T08:00:00Z' });
    expect(config.release).toEqual({ commitSha: 'abc1234', buildTime: '2026-11-07T08:00:00Z' });
  });

  it('[INFRA] fails with the variable name when DATABASE_URL is missing', () => {
    expect(() => parseConfig({ SESSION_SECRET: VALID.SESSION_SECRET })).toThrow(ConfigError);
    expect(() => parseConfig({ SESSION_SECRET: VALID.SESSION_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('[INFRA] names an invalid variable without echoing its value', () => {
    const run = () => parseConfig({ ...VALID, DATABASE_URL: 'mysql://hidden-value-123@db', LOG_LEVEL: 'verbose-xyz' });
    expect(run).toThrow(ConfigError);
    try {
      run();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('LOG_LEVEL');
      expect(message).not.toContain('hidden-value-123');
      expect(message).not.toContain('verbose-xyz');
      expect((error as ConfigError).variables.sort()).toEqual(['DATABASE_URL', 'LOG_LEVEL']);
    }
  });

  it('[SEC-1] rejects a missing or short SESSION_SECRET without echoing it', () => {
    expect(() => parseConfig({ DATABASE_URL: VALID.DATABASE_URL })).toThrow(/SESSION_SECRET must be at least 32/);
    try {
      parseConfig({ ...VALID, SESSION_SECRET: 'too-short-secret' });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).variables).toEqual(['SESSION_SECRET']);
      expect((error as Error).message).not.toContain('too-short-secret');
    }
  });

  it('[UX-5] DEMO_MODE accepts only true or false and defaults to off', () => {
    expect(parseConfig({ ...VALID, DEMO_MODE: 'true' }).demoMode).toBe(true);
    expect(parseConfig({ ...VALID, DEMO_MODE: 'false' }).demoMode).toBe(false);
    expect(() => parseConfig({ ...VALID, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/);
  });
});
