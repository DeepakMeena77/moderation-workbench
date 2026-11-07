import type { AiStatus } from './types';

// One AiRun per pipeline run (docs/02-system-design.md sec. 3, AI-10). The fields match the Prisma model; the id
// and createdAt come from the sink. The database sink arrives with the analysis job, after S2 merges.

export interface AiRunRecord {
  purpose: 'classify' | 'appeal_brief';
  provider: string;
  /** The model that produced the accepted output, or the last one tried. */
  model: string;
  modelsTried: string[];
  promptVersion: string;
  promptHash: string;
  policyVersion: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  latencyMs: number;
  /** Provider calls made, including retries, the fallback model and the repair call. */
  attempts: number;
  repairUsed: boolean;
  fallbackUsed: boolean;
  parseStrategy: string | null;
  trimmedContext: boolean;
  status: AiStatus;
  errorCode: string | null;
  /** Sanitised: never content text, never a key. */
  errorMessage: string | null;
}

export interface AiRunSink {
  /** Stores the record and returns its id (Analysis.aiRunId). */
  write(record: AiRunRecord): Promise<string>;
}

/** Calls already made today, for AI_MAX_CALLS_PER_DAY. The database version counts from AiRun rows. */
export interface CallCounter {
  callsToday(): Promise<number>;
}

export class InMemoryAiRunSink implements AiRunSink {
  readonly records: Array<AiRunRecord & { id: string }> = [];

  async write(record: AiRunRecord): Promise<string> {
    const id = `airun_${this.records.length + 1}`;
    this.records.push({ ...record, id });
    return id;
  }
}

/** Counts the attempts recorded in a sink, so a test can drive the daily budget with real runs. */
export class InMemoryCallCounter implements CallCounter {
  constructor(
    private readonly sink: InMemoryAiRunSink,
    private readonly offset = 0,
  ) {}

  async callsToday(): Promise<number> {
    return this.offset + this.sink.records.reduce((sum, r) => sum + r.attempts, 0);
  }
}

// Both Google key formats (the older AIza... and the newer AQ.... keys) and key= query parameters.
const KEY_LIKE = /AIza[0-9A-Za-z_-]{20,}|\bAQ\.[A-Za-z0-9_-]{20,}|key=[^&\s]+/g;

/** Error text for storage: one line, no keys, bounded length. Provider messages never contain the content. */
export function sanitizeErrorMessage(message: string): string {
  return message.replace(KEY_LIKE, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 300);
}
