import { z } from 'zod';
import { DEMO_ACCOUNT_KEYS } from '@/server/auth/demo';
import { isSecureRequest, sessionCookie } from '@/server/auth/token';
import { handle, jsonWithCookie } from '@/server/http';
import { signInDemo } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

const body = z.object({ account: z.enum(DEMO_ACCOUNT_KEYS) });

// One-click sign-in for the demo accounts (UX-5). 404 unless DEMO_MODE=true. Not rate limited: it takes no
// credentials, and the accounts are public test accounts.
export const POST = handle({ route: 'POST /api/auth/demo', auth: 'public', body }, async ({ req, body, log }) => {
  const { actor, token } = await signInDemo(body.account);
  log.info({ event: 'auth.signed_in', method: 'demo', userId: actor.id, role: actor.role });
  return jsonWithCookie(
    { user: { id: actor.id, email: actor.email, name: actor.name, role: actor.role } },
    sessionCookie(token, isSecureRequest(req)),
  );
});
