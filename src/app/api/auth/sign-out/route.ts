import { clearedSessionCookie, isSecureRequest } from '@/server/auth/token';
import { handle, jsonWithCookie } from '@/server/http';

export const dynamic = 'force-dynamic';

// Clears the session cookie. The token itself stays valid until it expires (8 hours); that is the known limit
// of a stateless session, softened because every request re-reads the user (docs/02-system-design.md sec. 10).
export const POST = handle({ route: 'POST /api/auth/sign-out', auth: 'signed-in' }, async ({ req, actor, log }) => {
  log.info({ event: 'auth.signed_out', userId: actor.id });
  return jsonWithCookie({ signedOut: true }, clearedSessionCookie(isSecureRequest(req)));
});
