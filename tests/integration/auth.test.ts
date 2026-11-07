import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as demo } from '@/app/api/auth/demo/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as signIn } from '@/app/api/auth/sign-in/route';
import { POST as signOut } from '@/app/api/auth/sign-out/route';
import { DEMO_ACCOUNTS } from '@/server/auth/demo';
import { resetConfigForTests } from '@/server/config';
import { apiRequest, createUser, readJson, sessionCookieFor, TEST_PASSWORD } from './helpers/users';

interface ErrorBody {
  error: { code: string; message: string };
}
interface UserBody {
  data: { user: { id: string; email: string; name: string; role: string } };
}

function signInRequest(email: string, password: string, ip = '203.0.113.10', headers: Record<string, string> = {}) {
  return apiRequest('/api/auth/sign-in', { method: 'POST', body: { email, password }, ip, headers });
}

/** The "name=value" part of a Set-Cookie header, usable as a Cookie request header. */
function cookiePair(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

afterEach(() => {
  vi.useRealTimers();
});

describe('password sign-in', () => {
  it('[SEC-1] a correct password returns the user and an 8-hour HttpOnly, SameSite=Lax session cookie', async () => {
    const user = await createUser('moderator');
    const res = await signIn(signInRequest(user.email, TEST_PASSWORD));
    expect(res.status).toBe(200);
    expect((await readJson<UserBody>(res)).data.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'moderator',
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^mw_session=[\w-]+\.[\w-]+\.[\w-]+; Path=\/; Max-Age=28800; HttpOnly; SameSite=Lax$/);

    const whoAmI = await me(apiRequest('/api/auth/me', { cookie: cookiePair(res) }));
    expect((await readJson<UserBody>(whoAmI)).data.user.id).toBe(user.id);
  });

  it('[SEC-1] the cookie is Secure when the request arrived over https', async () => {
    const user = await createUser('author');
    const res = await signIn(signInRequest(user.email, TEST_PASSWORD, undefined, { 'x-forwarded-proto': 'https' }));
    expect(res.headers.get('set-cookie')).toMatch(/; Secure$/);
  });

  it('[SEC-1] the email is matched without regard to case', async () => {
    const user = await createUser('author');
    const res = await signIn(signInRequest(user.email.toUpperCase(), TEST_PASSWORD));
    expect(res.status).toBe(200);
  });

  it('[SEC-1] a wrong password and an unknown email get the same 401, and no cookie', async () => {
    const user = await createUser('author');
    const wrong = await signIn(signInRequest(user.email, 'not-the-password'));
    const unknown = await signIn(signInRequest('nobody@example.test', TEST_PASSWORD));
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect((await readJson<ErrorBody>(res)).error).toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Email or password is incorrect.',
      });
    }
  });

  it('[SEC-3] an invalid body gets 400 with the field paths', async () => {
    const res = await signIn(apiRequest('/api/auth/sign-in', { method: 'POST', body: { email: 'not-an-email' } }));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: { details: Array<{ path: string }> } }>(res);
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['email', 'password']);
  });
});

describe('sign-in rate limit', () => {
  it('[SEC-4] the 21st attempt from one IP within 15 minutes gets 429 with Retry-After and a clear message', async () => {
    // Windows are aligned to the clock, so the clock is pinned mid-window: with real time, 21 attempts made
    // around a quarter-hour boundary would fall into two windows and never reach the limit.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T10:05:00.000Z'));
    const user = await createUser('author');
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const res = await signIn(signInRequest(user.email, 'wrong-password', '198.51.100.7'));
      expect(res.status, `attempt ${attempt}`).toBe(401);
    }
    const limited = await signIn(signInRequest(user.email, 'wrong-password', '198.51.100.7'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe(String(10 * 60));
    expect((await readJson<ErrorBody>(limited)).error).toMatchObject({ code: 'RATE_LIMITED' });

    // Once limited, even the right password is refused, so a correct guess cannot slip through.
    const correct = await signIn(signInRequest(user.email, TEST_PASSWORD, '198.51.100.7'));
    expect(correct.status).toBe(429);
    expect((await readJson<ErrorBody>(correct)).error.message).toBe(
      'Too many sign-in attempts. Try again in 10 minutes.',
    );

    // Another IP is unaffected.
    expect((await signIn(signInRequest(user.email, TEST_PASSWORD, '198.51.100.8'))).status).toBe(200);
  });

  it('[SEC-4] the limit resets when the 15-minute window ends', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const windowStart = new Date('2026-11-07T10:00:00.000Z');
    vi.setSystemTime(new Date(windowStart.getTime() + 60_000));
    const user = await createUser('author');
    for (let attempt = 1; attempt <= 21; attempt += 1) {
      await signIn(signInRequest(user.email, 'wrong-password', '192.0.2.44'));
    }
    const limited = await signIn(signInRequest(user.email, TEST_PASSWORD, '192.0.2.44'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe(String(14 * 60));

    vi.setSystemTime(new Date(windowStart.getTime() + 15 * 60_000));
    expect((await signIn(signInRequest(user.email, TEST_PASSWORD, '192.0.2.44'))).status).toBe(200);
  });

  it('[SEC-4] demo sign-in is not limited (it takes no credentials)', async () => {
    await createUser('moderator', 'moderator@example.com');
    for (let attempt = 1; attempt <= 25; attempt += 1) {
      const res = await demo(
        apiRequest('/api/auth/demo', { method: 'POST', body: { account: 'moderator' }, ip: '192.0.2.99' }),
      );
      expect(res.status, `attempt ${attempt}`).toBe(200);
    }
  });
});

describe('demo sign-in', () => {
  const original = process.env.DEMO_MODE;

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
    resetConfigForTests();
  });

  afterEach(() => {
    process.env.DEMO_MODE = original;
    resetConfigForTests();
  });

  it('[UX-5] each demo account signs in with one request and gets its seeded role', async () => {
    for (const account of DEMO_ACCOUNTS) await createUser(account.role, account.email);
    for (const account of DEMO_ACCOUNTS) {
      const res = await demo(apiRequest('/api/auth/demo', { method: 'POST', body: { account: account.key } }));
      expect(res.status, account.key).toBe(200);
      expect((await readJson<UserBody>(res)).data.user).toMatchObject({ email: account.email, role: account.role });
      expect(res.headers.get('set-cookie')).toMatch(/^mw_session=/);
    }
  });

  it('[UX-5] an unknown account gets 400', async () => {
    const res = await demo(apiRequest('/api/auth/demo', { method: 'POST', body: { account: 'root' } }));
    expect(res.status).toBe(400);
    expect((await readJson<ErrorBody>(res)).error.code).toBe('VALIDATION_FAILED');
  });

  it('[UX-5] an account that was not seeded gets 404 with the fix', async () => {
    const res = await demo(apiRequest('/api/auth/demo', { method: 'POST', body: { account: 'admin' } }));
    expect(res.status).toBe(404);
    expect((await readJson<ErrorBody>(res)).error.message).toContain('npm run db:seed');
  });

  it('[UX-5] with DEMO_MODE off the route answers 404 and sets no cookie', async () => {
    await createUser('admin', 'admin@example.com');
    process.env.DEMO_MODE = 'false';
    resetConfigForTests();
    const res = await demo(apiRequest('/api/auth/demo', { method: 'POST', body: { account: 'admin' } }));
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('sign-out and me', () => {
  it('[SEC-1] sign-out clears the cookie', async () => {
    const user = await createUser('author');
    const res = await signOut(
      apiRequest('/api/auth/sign-out', { method: 'POST', cookie: await sessionCookieFor(user.id) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe('mw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  });

  it('[SEC-1] me returns the signed-in user', async () => {
    const user = await createUser('senior_moderator');
    const res = await me(apiRequest('/api/auth/me', { cookie: await sessionCookieFor(user.id) }));
    expect((await readJson<UserBody>(res)).data.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'senior_moderator',
    });
  });
});
