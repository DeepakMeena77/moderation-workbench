import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import {
  ProviderError,
  kindForStatus,
  type AiProvider,
  type GenerateJsonRequest,
  type GenerateJsonResponse,
} from './provider';

// Gemini provider: JSON mode with a response schema, and the least thinking each model allows. Thinking tokens
// count against maxOutputTokens: with default thinking, a 20-token JSON request to a flash model came back as
// `{"`, so the thinking setting is what keeps the output cap usable.

/** The lowest thinking setting per model family. 2.5 Pro cannot turn thinking off; its floor is 128. */
export function thinkingConfigFor(model: string): ThinkingConfig {
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  // Gemini 3 and later take a thinking level instead of a token budget.
  return { thinkingLevel: ThinkingLevel.MINIMAL };
}

const RETRY_DELAY_RE = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/;
const DAILY_QUOTA_RE = /PerDay/i;

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof ApiError) {
    const kind = kindForStatus(error.status);
    const delay = RETRY_DELAY_RE.exec(error.message);
    return new ProviderError(kind, `Gemini API error ${error.status}`, {
      status: error.status,
      retryAfterMs: delay ? Math.round(Number(delay[1]) * 1000) : undefined,
      quotaExhausted: kind === 'rate_limited' && DAILY_QUOTA_RE.test(error.message),
    });
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new ProviderError('timeout', 'Gemini request aborted');
  }
  // fetch failures (DNS, reset connections) surface as TypeError; they are transient.
  return new ProviderError('network', error instanceof Error ? `${error.name}: network failure` : 'network failure');
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    // The SDK's own retry is off (one attempt): pipeline.ts owns retries so the bounds are not multiplied.
    this.client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  }

  async generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    try {
      const response = await this.client.models.generateContent({
        model: request.model,
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
          maxOutputTokens: request.maxOutputTokens,
          thinkingConfig: thinkingConfigFor(request.model),
          abortSignal: request.signal,
          httpOptions: { timeout: request.timeoutMs },
        },
      });
      const usage = response.usageMetadata;
      return {
        text: response.text ?? '',
        usage: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
          thinking: usage?.thoughtsTokenCount ?? 0,
        },
        model: request.model,
        finishReason: response.candidates?.[0]?.finishReason ?? null,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
