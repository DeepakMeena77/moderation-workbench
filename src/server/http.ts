import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from './errors';
import { getLogger } from './logger';

// The wrapper every route handler uses (docs/02-system-design.md sec. 10): request ID, CSRF check on
// mutations, body size limit, Zod parsing, error mapping and the http.request log line. Auth and role
// checks join in S1.

export const MAX_BODY_BYTES = 100 * 1024; // SEC-3
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface HandlerContext<TBody, TQuery> {
  req: Request;
  requestId: string;
  body: TBody;
  query: TQuery;
  log: Logger;
}

export interface RouteOptions<TBody extends ZodTypeAny | undefined, TQuery extends ZodTypeAny | undefined> {
  /** Stable route name for logs, e.g. "GET /api/health". */
  route: string;
  body?: TBody;
  query?: TQuery;
}

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

export function handle<
  TBody extends ZodTypeAny | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
>(
  options: RouteOptions<TBody, TQuery>,
  handler: (ctx: HandlerContext<Infer<TBody>, Infer<TQuery>>) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const started = performance.now();
    const incomingId = req.headers.get('x-request-id');
    const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
    const log = getLogger().child({ requestId });
    let response: Response;

    try {
      const isMutation = !SAFE_METHODS.has(req.method);
      if (isMutation && !isSameOrigin(req)) {
        throw new AppError('FORBIDDEN', 'Cross-site requests are not allowed.');
      }
      const body = (options.body ? await readBody(req, options.body) : await rejectOversizedBody(req)) as Infer<TBody>;
      const query = (options.query ? parseQuery(req, options.query) : undefined) as Infer<TQuery>;
      const result = await handler({ req, requestId, body, query, log });
      response = result instanceof Response ? result : json({ data: result }, 200);
    } catch (error) {
      response = errorResponse(error, requestId, log, options.route);
    }

    response.headers.set('x-request-id', requestId);
    log.info({
      event: 'http.request',
      method: req.method,
      route: options.route,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      userId: null,
    });
    return response;
  };
}

// SEC-5 (CSRF): a mutation must come from our own pages. Browsers send Sec-Fetch-Site and Origin and page
// scripts cannot forge them, so either a same-origin Sec-Fetch-Site or a matching Origin is accepted.
// A request with neither is rejected.
export function isSameOrigin(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(req.url).origin]);
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    allowed.add(`${proto}://${forwardedHost}`);
  }
  return allowed.has(origin);
}

async function rejectOversizedBody(req: Request): Promise<undefined> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw tooLarge();
  return undefined;
}

async function readBody(req: Request, schema: ZodTypeAny): Promise<unknown> {
  await rejectOversizedBody(req);
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw tooLarge();
  let raw: unknown;
  try {
    raw = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'The request body is not valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function parseQuery(req: Request, schema: ZodTypeAny): unknown {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function validationError(error: z.ZodError): AppError {
  return new AppError(
    'VALIDATION_FAILED',
    'Some fields are not valid.',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

function tooLarge(): AppError {
  return new AppError('PAYLOAD_TOO_LARGE', `The request body is larger than ${MAX_BODY_BYTES / 1024} kB.`);
}

function errorResponse(error: unknown, requestId: string, log: Logger, route: string): Response {
  if (error instanceof AppError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          requestId,
        },
      },
      error.status,
    );
  }
  // Unknown errors are logged with context but never echoed: their messages can contain internals.
  log.error({ event: 'http.error', route, err: error });
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId } }, 500);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}
