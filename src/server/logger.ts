import { createHash } from 'node:crypto';
import pino, { type DestinationStream, type Logger } from 'pino';
import { getConfig, type LogLevel } from './config';

// SEC-5: secrets, cookies and credentials are redacted wherever they appear one level deep in a log object.
// Log objects stay flat by convention (event name plus scalar fields), so one level is enough.
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'cookie',
  'set-cookie',
  'authorization',
  'x-cron-secret',
  'apiKey',
  'token',
  'secret',
  'GEMINI_API_KEY',
  'SESSION_SECRET',
  'CRON_SECRET',
  'DEMO_PASSWORD',
  'DATABASE_URL',
  'DIRECT_URL',
];

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => {
  const accessor = /^[A-Za-z_]\w*$/.test(key) ? key : `["${key}"]`;
  const nested = accessor.startsWith('[') ? `*${accessor}` : `*.${accessor}`;
  return [accessor, nested];
});

export interface LoggerOptions {
  level?: LogLevel;
  destination?: DestinationStream;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      level: options.level ?? 'info',
      base: { service: 'moderation-workbench' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    },
    options.destination,
  );
}

let shared: Logger | undefined;

export function getLogger(): Logger {
  shared ??= createLogger({ level: getConfig().logLevel });
  return shared;
}

// Content text is never logged (SEC-5): only its length and a hash, so two log lines can still be matched.
export function contentFingerprint(text: string): { len: number; sha256: string } {
  return { len: text.length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}
