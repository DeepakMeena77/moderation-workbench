import { SignJWT } from 'jose/jwt/sign';
import { describe, expect, it } from 'vitest';
import {
  clearedSessionCookie,
  isSecureRequest,
  readSessionToken,
  SESSION_TTL_SECONDS,
  sessionCookie,
  signSessionToken,
  verifySessionToken,
} from '@/server/auth/token';
import { safeNextPath } from '@/ui/shell/navigation';

const SECRET = 'unit-test-session-secret-placeholder-000';
const OTHER_SECRET = 'another-session-secret-placeholder-0000';
const NOW = new Date('2026-11-07T10:00:00Z');

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('session token', () => {
  it('[SEC-1] round-trips the user ID', async () => {
    const token = await signSessionToken('user-1', SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBe('user-1');
  });

  it('[SEC-1] carries no role, email or name: the role is always re-read from the database', async () => {
    const payload = decodePayload(await signSessionToken('user-1', SECRET, NOW));
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(payload.exp).toBe((payload.iat as number) + SESSION_TTL_SECONDS);
  });

  it('[SEC-1] rejects a token signed with another secret', async () => {
    const token = await signSessionToken('user-1', OTHER_SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  it('[SEC-1] rejects a token after 8 hours', async () => {
    const token = await signSessionToken('user-1', SECRET, NOW);
    const justBefore = new Date(NOW.getTime() + (SESSION_TTL_SECONDS - 1) * 1000);
    const after = new Date(NOW.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    expect(await verifySessionToken(token, SECRET, justBefore)).toBe('user-1');
    expect(await verifySessionToken(token, SECRET, after)).toBeNull();
  });

  it('[SEC-1] rejects a token whose payload was edited', async () => {
    const token = await signSessionToken('user-1', SECRET, NOW);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...decodePayload(token), sub: 'admin-user' })).toString('base64url');
    expect(await verifySessionToken(`${header}.${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('[SEC-1] rejects an unsigned token (alg "none") and garbage', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        iss: 'moderation-workbench',
        aud: 'moderation-workbench',
        exp: 9999999999,
      }),
    ).toString('base64url');
    expect(await verifySessionToken(`${header}.${payload}.`, SECRET, NOW)).toBeNull();
    expect(await verifySessionToken('not-a-token', SECRET, NOW)).toBeNull();
  });

  it('[SEC-1] rejects a validly signed token from another issuer or audience', async () => {
    const key = new TextEncoder().encode(SECRET);
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('another-app')
      .setAudience('another-app')
      .setExpirationTime('1h')
      .sign(key);
    expect(await verifySessionToken(foreign, SECRET)).toBeNull();
  });
});

describe('session cookie', () => {
  it('[SEC-1] is HttpOnly, SameSite=Lax, Path=/ and lasts 8 hours', () => {
    const cookie = sessionCookie('abc', false);
    expect(cookie).toBe('mw_session=abc; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax');
  });

  it('[SEC-1] adds Secure only when the request arrived over https', () => {
    expect(sessionCookie('abc', true)).toMatch(/; Secure$/);
    const viaProxy = new Request('http://internal/api', { headers: { 'x-forwarded-proto': 'https' } });
    expect(isSecureRequest(viaProxy)).toBe(true);
    expect(isSecureRequest(new Request('http://127.0.0.1:3000/api'))).toBe(false);
    expect(isSecureRequest(new Request('https://example.org/api'))).toBe(true);
  });

  it('[SEC-1] sign-out clears the cookie with Max-Age=0', () => {
    expect(clearedSessionCookie(true)).toBe('mw_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  });

  it('[SEC-1] reads the session token from a Cookie header among other cookies', () => {
    expect(readSessionToken('theme=dark; mw_session=tok.en.x; other=1')).toBe('tok.en.x');
    expect(readSessionToken('theme=dark')).toBeNull();
    expect(readSessionToken('mw_session=')).toBeNull();
    expect(readSessionToken(null)).toBeNull();
  });
});

describe('next path after sign-in', () => {
  it('[SEC-1] keeps same-site paths with their query', () => {
    expect(safeNextPath('/queue')).toBe('/queue');
    expect(safeNextPath('/queue?q=HAR-1')).toBe('/queue?q=HAR-1');
  });

  it('[SEC-1] drops anything that could leave the site or loop back to sign-in', () => {
    for (const value of [
      null,
      '',
      'queue',
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      '/sign-in',
      '/sign-in?next=/queue',
      '/x\u0000y',
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });
});
