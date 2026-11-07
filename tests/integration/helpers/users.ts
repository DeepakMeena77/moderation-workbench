import type { Role, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SESSION_COOKIE, signSessionToken } from '@/server/auth/token';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db';

// Builders for integration tests: users, session cookies and API requests. The database is emptied before
// every test (tests/integration/setup.ts), so each test creates exactly what it needs.

export const ORIGIN = 'http://localhost:3000';
export const TEST_PASSWORD = 'test-password-not-secret';

let sequence = 0;

export async function createUser(role: Role, email?: string): Promise<User> {
  sequence += 1;
  return getDb().user.create({
    data: {
      email: email ?? `${role.replace('_', '-')}-${sequence}@example.test`,
      name: `Test ${role} ${sequence}`,
      role,
      // Cost 4 keeps the tests fast; the app and the seed use 10.
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    },
  });
}

export async function sessionCookieFor(userId: string, now?: Date, secret?: string): Promise<string> {
  const token = await signSessionToken(userId, secret ?? getConfig().sessionSecret, now);
  return `${SESSION_COOKIE}=${token}`;
}

export interface ApiRequestInit {
  method?: 'GET' | 'POST';
  cookie?: string;
  body?: unknown;
  ip?: string;
  headers?: Record<string, string>;
}

/** A same-origin request, as the browser would send it from our own pages. */
export function apiRequest(path: string, init: ApiRequestInit = {}): Request {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { ...init.headers };
  if (method !== 'GET') headers.origin ??= ORIGIN;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.ip) headers['x-forwarded-for'] = init.ip;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
