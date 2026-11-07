import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { signSessionToken } from '@/server/auth/token';
import { config, middleware } from '@/middleware';

// The secret comes from the unit project's env in vitest.config.mts.
const SECRET = process.env.SESSION_SECRET ?? '';

function pageRequest(path: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, token ? { headers: { cookie: `mw_session=${token}` } } : {});
}

describe('middleware page gate', () => {
  it('[SEC-1] redirects a page request without a session to sign-in, keeping where it was going', async () => {
    const res = await middleware(pageRequest('/queue?q=HAR-1'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('next')).toBe('/queue?q=HAR-1');
  });

  it('[SEC-1] redirects the start page to sign-in without a next parameter', async () => {
    const res = await middleware(pageRequest('/'));
    expect(new URL(res.headers.get('location') ?? '').search).toBe('');
  });

  it('[SEC-1] lets a request with a valid session through', async () => {
    const res = await middleware(pageRequest('/queue', await signSessionToken('user-1', SECRET)));
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('[SEC-1] redirects a request whose session token is forged or expired', async () => {
    const forged = await signSessionToken('user-1', 'another-session-secret-placeholder-0000');
    expect((await middleware(pageRequest('/queue', forged))).status).toBe(307);
    const expired = await signSessionToken('user-1', SECRET, new Date(Date.now() - 9 * 60 * 60 * 1000));
    expect((await middleware(pageRequest('/queue', expired))).status).toBe(307);
  });

  it('[SEC-1] gates every app page and leaves sign-in, status, the API and assets alone', () => {
    for (const url of ['/', '/feed', '/queue', '/queue/abc', '/policy/compare', '/unknown-page']) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    }
    for (const url of [
      '/sign-in',
      '/sign-in?next=%2Fqueue',
      '/status',
      '/api/auth/me',
      '/api/health',
      '/_next/static/chunks/main.js',
      '/favicon.ico',
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });
});
