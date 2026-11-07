// Provider interface (docs/02-system-design.md sec. 5.2). A provider makes exactly one call: retries, timeouts,
// the deadline, pacing and the fallback model live in pipeline.ts so every provider gets the same bounds.

export interface TokenUsage {
  input: number;
  output: number;
  /** Thinking tokens are billed as output and count against the output cap. */
  thinking: number;
}

export const ZERO_USAGE: TokenUsage = Object.freeze({ input: 0, output: 0, thinking: 0 });

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { input: a.input + b.input, output: a.output + b.output, thinking: a.thinking + b.thinking };
}

export interface GenerateJsonRequest {
  system: string;
  user: string;
  /** JSON Schema for the response (Gemini `responseJsonSchema`). */
  schema: Record<string, unknown>;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Aborted when the per-call timeout fires. A provider may ignore it; the pipeline still stops waiting. */
  signal: AbortSignal;
}

export interface GenerateJsonResponse {
  text: string;
  usage: TokenUsage;
  model: string;
  /** For example STOP or MAX_TOKENS; null when the provider did not say. */
  finishReason: string | null;
}

export interface AiProvider {
  readonly name: string;
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse>;
}

/**
 * - timeout, rate_limited, server, network: transient, retried with back-off
 * - not_found: the model is retired; go straight to the fallback model
 * - client: 400, 401 or 403; never retried, and a fallback model would fail the same way
 */
export type ProviderErrorKind = 'timeout' | 'rate_limited' | 'server' | 'network' | 'not_found' | 'client';

export interface ProviderErrorOptions {
  status?: number;
  /** The server's suggested wait before retrying (Gemini `retryDelay`). */
  retryAfterMs?: number;
  /** A daily quota is spent: retrying the same model today is pointless. */
  quotaExhausted?: boolean;
}

export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly quotaExhausted: boolean;

  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    options: ProviderErrorOptions = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.quotaExhausted = options.quotaExhausted ?? false;
  }
}

export function isTransient(error: ProviderError): boolean {
  return (
    error.kind === 'timeout' ||
    error.kind === 'server' ||
    error.kind === 'network' ||
    (error.kind === 'rate_limited' && !error.quotaExhausted)
  );
}

/** Maps an HTTP status to an error kind. 408 counts as a timeout; 404 means the model is gone. */
export function kindForStatus(status: number): ProviderErrorKind {
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'client';
}
