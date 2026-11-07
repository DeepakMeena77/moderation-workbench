import { describe, expect, it } from 'vitest';
import { contentFingerprint, createLogger } from '@/server/logger';

function capture() {
  const lines: string[] = [];
  const logger = createLogger({ level: 'info', destination: { write: (line: string) => void lines.push(line) } });
  return { logger, lines };
}

describe('logger redaction', () => {
  it('[SEC-5] redacts cookies, authorisation headers and passwords', () => {
    const { logger, lines } = capture();
    logger.info({
      event: 'test.redaction',
      headers: { cookie: 'session=cookie-value-1', authorization: 'Bearer auth-value-2', 'set-cookie': 'sid=value-3' },
      password: 'password-value-4',
    });
    const line = lines.join('');
    for (const secret of ['cookie-value-1', 'auth-value-2', 'value-3', 'password-value-4']) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('[Redacted]');
    expect(line).toContain('test.redaction');
  });

  it('[SEC-5] redacts keys and secrets by name, top level and one level deep', () => {
    const { logger, lines } = capture();
    logger.info({
      GEMINI_API_KEY: 'key-value-5',
      SESSION_SECRET: 'secret-value-6',
      config: { apiKey: 'key-value-7', token: 'token-value-8', DATABASE_URL: 'url-value-9' },
      headers: { 'x-cron-secret': 'cron-value-10' },
    });
    const line = lines.join('');
    for (const secret of [
      'key-value-5',
      'secret-value-6',
      'key-value-7',
      'token-value-8',
      'url-value-9',
      'cron-value-10',
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  it('[SEC-5] content is logged as length and SHA-256 only, never as text', () => {
    const text = 'You are a worthless idiot';
    const fingerprint = contentFingerprint(text);
    expect(fingerprint).toEqual({
      len: 25,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(contentFingerprint('hello').sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

    const { logger, lines } = capture();
    logger.info({ event: 'content.created', content: fingerprint });
    expect(lines.join('')).not.toContain(text);
  });
});
