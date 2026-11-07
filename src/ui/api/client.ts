// Thin fetch wrapper for our own /api routes. It unwraps the { data } envelope and turns the { error }
// envelope into an ApiError the UI can show (message, code, request ID).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorEnvelope(payload: unknown): {
  code?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
} {
  if (!isRecord(payload) || !isRecord(payload.error)) return {};
  const { code, message, requestId, details } = payload.error;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    details,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.', null);
  }

  const headerRequestId = res.headers.get('x-request-id');
  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = readErrorEnvelope(payload);
    throw new ApiError(
      res.status,
      error.code ?? 'INTERNAL',
      error.message ?? `The request failed (${res.status}). Try again.`,
      error.requestId ?? headerRequestId,
      error.details,
    );
  }
  if (!isRecord(payload) || !('data' in payload)) {
    throw new ApiError(res.status, 'INTERNAL', 'The server sent an unexpected response.', headerRequestId);
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
};
