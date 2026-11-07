import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import type { Logger } from 'pino';
import { z, type ZodTypeAny } from 'zod';
import { getActor, type Actor } from './auth/session';
import { AppError } from './errors';
import { getLogger } from './logger';

// The wrapper every route handler uses (docs/02-system-design.md sec. 10): request ID, CSRF check on
// mutations, authentication and role check, body size limit, Zod parsing, error mapping and the
// http.request log line.

export const MAX_BODY_BYTES = 100 * 1024; // SEC-3
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Who may call a route (SEC-1). Required on every route, so a new route cannot forget it:
 * - 'public': no session needed (only sign-in, demo sign-in, status and health)
 * - 'signed-in': any role
 * - a list of roles: only those roles
 */
export type AuthRequirement = 'public' | 'signed-in' | readonly Role[];

type ActorFor<A extends AuthRequirement> = A extends 'public' ? null : Actor;

export interface HandlerContext<TBody, TQuery, TActor, TParams = undefined> {
  req: Request;
  requestId: string;
  actor: TActor;
  body: TBody;
  query: TQuery;
  /** Path parameters named in `route` (":id"), parsed with the `params` schema. */
  params: TParams;
  log: Logger;
}

export interface RouteOptions<
  TBody extends ZodTypeAny | undefined,
  TQuery extends ZodTypeAny | undefined,
  TAuth extends AuthRequirement,
  TParams extends ZodTypeAny | undefined = undefined,
> {
  /** Stable route name for logs, e.g. "GET /api/health". Path parameters are written ":name". */
  route: string;
  auth: TAuth;
  body?: TBody;
  query?: TQuery;
  /** Schema for the ":name" segments of `route`, read from the request URL. */
  params?: TParams;
}

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

export function handle<
  TAuth extends AuthRequirement,
  TBody extends ZodTypeAny | undefined = undefined,
  TQuery extends ZodTypeAny | undefined = undefined,
  TParams extends ZodTypeAny | undefined = undefined,
>(
  options: RouteOptions<TBody, TQuery, TAuth, TParams>,
  handler: (ctx: HandlerContext<Infer<TBody>, Infer<TQuery>, ActorFor<TAuth>, Infer<TParams>>) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const started = performance.now();
    const incomingId = req.headers.get('x-request-id');
    const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
    const log = getLogger().child({ requestId });
    let actor: Actor | null = null;
    let response: Response;

    try {
      const isMutation = !SAFE_METHODS.has(req.method);
      if (isMutation && !isSameOrigin(req)) {
        throw new AppError('FORBIDDEN', 'Cross-site requests are not allowed.');
      }
      if (options.auth !== 'public') {
        actor = await authorize(req, options.auth, options.route, log);
      }
      const body = (options.body ? await readBody(req, options.body) : await rejectOversizedBody(req)) as Infer<TBody>;
      const query = (options.query ? parseQuery(req, options.query) : undefined) as Infer<TQuery>;
      const params = (options.params ? parseParams(req, options.route, options.params) : undefined) as Infer<TParams>;
      const result = await handler({ req, requestId, actor: actor as ActorFor<TAuth>, body, query, params, log });
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
      userId: actor?.id ?? null,
    });
    return response;
  };
}

async function authorize(
  req: Request,
  required: 'signed-in' | readonly Role[],
  route: string,
  log: Logger,
): Promise<Actor> {
  const actor = await getActor(req);
  if (!actor) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  if (required !== 'signed-in' && !required.includes(actor.role)) {
    log.warn({ event: 'access.denied', route, userId: actor.id, role: actor.role, required });
    throw new AppError('FORBIDDEN', "You don't have access to this.");
  }
  return actor;
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

/** The caller's IP for per-IP limits: the first x-forwarded-for entry (set by the Vercel edge). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** A { data } response that also sets (or clears) a cookie, for the sign-in and sign-out routes. */
export function jsonWithCookie(data: unknown, setCookie: string): Response {
  const response = json({ data }, 200);
  response.headers.append('set-cookie', setCookie);
  return response;
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

/**
 * The ":name" segments of a route pattern, read from the request path. Taken from the URL rather than the
 * Next.js context argument, so handlers stay plain (req) => Response functions that tests can call directly.
 */
export function matchPathParams(route: string, pathname: string): Record<string, string> | null {
  const pattern = (route.split(' ')[1] ?? route).split('/');
  const actual = pathname.replace(/\/+$/, '').split('/');
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i] ?? '';
    const segment = actual[i] ?? '';
    if (expected.startsWith(':')) {
      try {
        params[expected.slice(1)] = decodeURIComponent(segment);
      } catch {
        return null;
      }
    } else if (expected !== segment) {
      return null;
    }
  }
  return params;
}

function parseParams(req: Request, route: string, schema: ZodTypeAny): unknown {
  const raw = matchPathParams(route, new URL(req.url).pathname);
  if (!raw) throw new AppError('NOT_FOUND', 'Not found.');
  const parsed = schema.safeParse(raw);
  // A malformed identifier cannot name anything that exists.
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Not found.');
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

function retryAfterSeconds(details: unknown): number | null {
  if (typeof details !== 'object' || details === null || !('retryAfterS' in details)) return null;
  const value = (details as { retryAfterS: unknown }).retryAfterS;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function errorResponse(error: unknown, requestId: string, log: Logger, route: string): Response {
  if (error instanceof AppError) {
    const response = json(
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
    const retryAfter = error.code === 'RATE_LIMITED' ? retryAfterSeconds(error.details) : null;
    if (retryAfter !== null) response.headers.set('retry-after', String(retryAfter));
    return response;
  }
  // Unknown errors are logged with context but never echoed: their messages can contain internals.
  log.error({ event: 'http.error', route, err: error });
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId } }, 500);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}
