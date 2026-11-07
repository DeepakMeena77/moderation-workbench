import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Actor } from '../auth/session';
import { DEMO_ACCOUNTS, type DemoAccountKey } from '../auth/demo';
import { signSessionToken } from '../auth/token';
import { getConfig } from '../config';
import { getDb } from '../db';
import { AppError } from '../errors';
import { enforceRateLimit, type RateLimitRule } from './rateLimit';

// Sign-in (docs/02-system-design.md sec. 7 and sec. 10). Accounts are seeded; there is no sign-up.

/** SEC-4: 20 password attempts per 15 minutes per IP. Demo sign-in has no credentials and is not limited. */
export const SIGN_IN_LIMIT: RateLimitRule = { limit: 20, windowMs: 15 * 60 * 1000 };

const INVALID_CREDENTIALS = 'Email or password is incorrect.';

export interface SignedIn {
  actor: Actor;
  token: string;
}

// Compared against when the email is unknown, so a missing account takes as long as a wrong password and
// the response time does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomUUID(), 10);
  return dummyHash;
}

async function issueSession(user: Omit<Actor, 'type'>): Promise<SignedIn> {
  const actor: Actor = { type: 'human', ...user };
  return { actor, token: await signSessionToken(actor.id, getConfig().sessionSecret) };
}

export async function signInWithPassword(
  input: { email: string; password: string },
  clientIp: string,
  now: Date = new Date(),
): Promise<SignedIn> {
  // Every attempt counts, successful or not, so the limit also slows down a correct-guess run.
  await enforceRateLimit(
    `sign-in:ip:${clientIp}`,
    SIGN_IN_LIMIT,
    (wait) => `Too many sign-in attempts. Try again in ${wait}.`,
    now,
  );
  const user = await getDb().user.findUnique({ where: { email: input.email.toLowerCase() } });
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !matches) throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  return issueSession({ id: user.id, email: user.email, name: user.name, role: user.role });
}

export async function signInDemo(key: DemoAccountKey): Promise<SignedIn> {
  // Outside demo mode the route does not exist as far as callers can tell (UX-5).
  if (!getConfig().demoMode) throw new AppError('NOT_FOUND', 'Not found.');
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.key === key);
  if (!account) throw new AppError('VALIDATION_FAILED', 'Unknown demo account.');
  const user = await getDb().user.findUnique({
    where: { email: account.email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    throw new AppError('NOT_FOUND', 'This demo account does not exist yet. Run npm run db:seed.');
  }
  return issueSession(user);
}
