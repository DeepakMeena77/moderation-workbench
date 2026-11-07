// Narrow entry points: the package root also pulls in JWE (encryption), which the edge build flags for
// CompressionStream. Sessions only sign and verify (JWS).
import { JOSEError } from 'jose/errors';
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';

// Session token and cookie (docs/02-system-design.md sec. 10). This module has no database or Node-only
// imports, so the edge middleware can verify a token too. The token carries only the user ID: the role is
// re-read from the database on every request (SEC-1).

export const SESSION_COOKIE = 'mw_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = 'moderation-workbench';
const AUDIENCE = 'moderation-workbench';

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string, secret: string, now: Date = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(keyFrom(secret));
}

/** The user ID of a valid, unexpired token, or null. */
export async function verifySessionToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    });
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch (error) {
    // A malformed, tampered or expired token is an ordinary signed-out state, not a fault: anyone can send
    // any cookie. Anything that is not a JOSE validation error is a real fault and propagates.
    if (error instanceof JOSEError) return null;
    throw error;
  }
}

/** The session token from a Cookie request header. */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Secure is set when the request reached us over https (Vercel sets x-forwarded-proto). It is not tied to
 * NODE_ENV, so a local production build served over http (the UI test suite) still keeps its cookie.
 */
export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  return new URL(req.url).protocol === 'https:';
}

function serializeCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(token: string, secure: boolean): string {
  return serializeCookie(token, SESSION_TTL_SECONDS, secure);
}

export function clearedSessionCookie(secure: boolean): string {
  return serializeCookie('', 0, secure);
}
