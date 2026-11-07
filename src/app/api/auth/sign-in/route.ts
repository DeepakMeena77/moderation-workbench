import { z } from 'zod';
import { isSecureRequest, sessionCookie } from '@/server/auth/token';
import { clientIp, handle, jsonWithCookie } from '@/server/http';
import { signInWithPassword } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

const body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

// Email and password sign-in for the seeded accounts; limited per IP (SEC-4).
export const POST = handle({ route: 'POST /api/auth/sign-in', auth: 'public', body }, async ({ req, body, log }) => {
  const { actor, token } = await signInWithPassword(body, clientIp(req));
  log.info({ event: 'auth.signed_in', method: 'password', userId: actor.id, role: actor.role });
  return jsonWithCookie(
    { user: { id: actor.id, email: actor.email, name: actor.name, role: actor.role } },
    sessionCookie(token, isSecureRequest(req)),
  );
});
