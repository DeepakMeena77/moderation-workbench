import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '@/server/config';

const VALID = { DATABASE_URL: 'postgresql://user:password@localhost:5432/app' };

describe('config', () => {
  it('[INFRA] parses a minimal valid environment and applies defaults', () => {
    const config = parseConfig(VALID);
    expect(config.databaseUrl).toBe(VALID.DATABASE_URL);
    expect(config.logLevel).toBe('info');
    expect(config.nodeEnv).toBe('development');
    expect(config.release).toEqual({ commitSha: null, buildTime: null });
  });

  it('[INFRA] reads the release identifier and build time when present', () => {
    const config = parseConfig({ ...VALID, VERCEL_GIT_COMMIT_SHA: 'abc1234', BUILD_TIME: '2026-11-07T08:00:00Z' });
    expect(config.release).toEqual({ commitSha: 'abc1234', buildTime: '2026-11-07T08:00:00Z' });
  });

  it('[INFRA] fails with the variable name when DATABASE_URL is missing', () => {
    expect(() => parseConfig({})).toThrow(ConfigError);
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });

  it('[INFRA] names an invalid variable without echoing its value', () => {
    const run = () => parseConfig({ DATABASE_URL: 'mysql://hidden-value-123@db', LOG_LEVEL: 'verbose-xyz' });
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
});
