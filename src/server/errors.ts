// Error codes and HTTP statuses from docs/02-system-design.md sec. 7.
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  SAME_REVIEWER: 403,
  HUMAN_REQUIRED: 403,
  NOT_FOUND: 404,
  ALREADY_REPORTED: 409,
  ALREADY_DECIDED: 409,
  STALE_ANALYSIS: 409,
  ALREADY_APPEALED: 409,
  APPEAL_WINDOW_CLOSED: 409,
  POLICY_UNCHANGED: 409,
  INVALID_TRANSITION: 409,
  PAYLOAD_TOO_LARGE: 413,
  NOT_APPEALABLE: 422,
  ACTION_NOT_ALLOWED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  DB_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}
