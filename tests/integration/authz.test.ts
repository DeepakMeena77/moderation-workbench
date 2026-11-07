import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as signOut } from '@/app/api/auth/sign-out/route';
import { getPageAccess, requirePageActor } from '@/server/auth/guards';
import { getDb } from '@/server/db';
import { handle } from '@/server/http';
import { getLogger } from '@/server/logger';
import { apiRequest, createUser, readJson, sessionCookieFor } from './helpers/users';

// SEC-1: every page and API needs a session, the role is re-read from the database on each request, and
// both pages and APIs check the role.

// Pages read the session through next/headers; outside a Next.js request it is replaced by a cookie jar the
// test controls.
const pageCookies = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'mw_session' && pageCookies.token ? { value: pageCookies.token } : undefined),
  }),
}));

// A route that only staff may call, standing in for the role-restricted routes of later slices.
const staffOnly = handle(
  { route: 'GET /api/test/staff', auth: ['moderator', 'senior_moderator', 'admin'] },
  async ({ actor }) => ({ role: actor.role }),
);

interface ErrorBody {
  error: { code: string };
}

afterEach(() => {
  pageCookies.token = null;
  vi.restoreAllMocks();
});

describe('API authentication', () => {
  it('[SEC-1] a request without a session gets 401 on signed-in routes', async () => {
    const res = await me(apiRequest('/api/auth/me'));
    expect(res.status).toBe(401);
    expect((await readJson<ErrorBody>(res)).error.code).toBe('UNAUTHENTICATED');
    expect((await signOut(apiRequest('/api/auth/sign-out', { method: 'POST' }))).status).toBe(401);
    expect((await staffOnly(apiRequest('/api/test/staff'))).status).toBe(401);
  });

  it('[SEC-1] a token signed with another secret gets 401', async () => {
    const user = await createUser('moderator');
    const cookie = await sessionCookieFor(user.id, undefined, 'another-session-secret-placeholder-0000');
    expect((await me(apiRequest('/api/auth/me', { cookie }))).status).toBe(401);
  });

  it('[SEC-1] an expired token gets 401', async () => {
    const user = await createUser('moderator');
    const cookie = await sessionCookieFor(user.id, new Date(Date.now() - 9 * 60 * 60 * 1000));
    expect((await me(apiRequest('/api/auth/me', { cookie }))).status).toBe(401);
  });

  it('[SEC-1] a valid token for a deleted user gets 401', async () => {
    const user = await createUser('moderator');
    const cookie = await sessionCookieFor(user.id);
    await getDb().user.delete({ where: { id: user.id } });
    expect((await me(apiRequest('/api/auth/me', { cookie }))).status).toBe(401);
  });
});

describe('API roles', () => {
  it('[SEC-1] the wrong role gets 403 FORBIDDEN and an access.denied log line; the right role gets 200', async () => {
    const logger = getLogger();
    vi.spyOn(logger, 'child').mockReturnValue(logger as unknown as ReturnType<typeof logger.child>);
    const warn = vi.spyOn(logger, 'warn');
    const author = await createUser('author');
    const moderator = await createUser('moderator');

    const denied = await staffOnly(apiRequest('/api/test/staff', { cookie: await sessionCookieFor(author.id) }));
    expect(denied.status).toBe(403);
    expect((await readJson<ErrorBody>(denied)).error.code).toBe('FORBIDDEN');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'access.denied', route: 'GET /api/test/staff', userId: author.id }),
    );

    const allowed = await staffOnly(apiRequest('/api/test/staff', { cookie: await sessionCookieFor(moderator.id) }));
    expect(allowed.status).toBe(200);
  });

  it('[SEC-1] the role is re-read from the database: a role change applies to the next request', async () => {
    const user = await createUser('moderator');
    const cookie = await sessionCookieFor(user.id);
    expect((await staffOnly(apiRequest('/api/test/staff', { cookie }))).status).toBe(200);

    await getDb().user.update({ where: { id: user.id }, data: { role: 'author' } });
    expect((await staffOnly(apiRequest('/api/test/staff', { cookie }))).status).toBe(403);
    const whoAmI = await readJson<{ data: { user: { role: string } } }>(
      await me(apiRequest('/api/auth/me', { cookie })),
    );
    expect(whoAmI.data.user.role).toBe('author');

    await getDb().user.update({ where: { id: user.id }, data: { role: 'senior_moderator' } });
    expect((await staffOnly(apiRequest('/api/test/staff', { cookie }))).status).toBe(200);
  });
});

describe('page guards', () => {
  async function signInPage(userId: string): Promise<void> {
    pageCookies.token = (await sessionCookieFor(userId)).split('=')[1] ?? null;
  }

  it('[SEC-1] a page without a session redirects to sign-in', async () => {
    await expect(requirePageActor()).rejects.toMatchObject({ digest: expect.stringContaining('/sign-in') });
  });

  it('[SEC-1] a page checks the role read from the database, not from the token', async () => {
    const user = await createUser('author');
    await signInPage(user.id);
    const staff = ['moderator', 'senior_moderator', 'admin'] as const;
    expect((await getPageAccess(staff)).allowed).toBe(false);
    expect((await getPageAccess(['author'])).allowed).toBe(true);

    await getDb().user.update({ where: { id: user.id }, data: { role: 'admin' } });
    const access = await getPageAccess(staff);
    expect(access.allowed).toBe(true);
    expect(access.actor.role).toBe('admin');
  });

  it('[SEC-1] a page with a token for a deleted user redirects to sign-in', async () => {
    const user = await createUser('moderator');
    await signInPage(user.id);
    await getDb().user.delete({ where: { id: user.id } });
    await expect(requirePageActor()).rejects.toMatchObject({ digest: expect.stringContaining('/sign-in') });
  });
});
