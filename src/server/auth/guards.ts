import type { Role } from '@prisma/client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getConfig } from '../config';
import { DEMO_ACCOUNTS } from './demo';
import { getActorFromToken, type Actor } from './session';
import { SESSION_COOKIE, verifySessionToken } from './token';

// The page-side half of SEC-1, and the only server module that layouts and pages in src/app may import
// (docs/02-system-design.md sec. 2). The middleware already turned away requests without a valid token;
// these checks re-read the user and role from the database before anything renders, so a deleted user or a
// changed role takes effect immediately and the shell never flashes for the wrong person.

/** One database read per request, shared by the layout and the page. */
export const getPageActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return getActorFromToken(store.get(SESSION_COOKIE)?.value ?? null);
});

export async function requirePageActor(): Promise<Actor> {
  const actor = await getPageActor();
  if (!actor) redirect('/sign-in');
  return actor;
}

export interface PageAccess {
  actor: Actor;
  allowed: boolean;
}

/** The signed-in actor and whether their role may open a page that allows `roles`. */
export async function getPageAccess(roles: readonly Role[]): Promise<PageAccess> {
  const actor = await requirePageActor();
  return { actor, allowed: roles.includes(actor.role) };
}

/**
 * Whether the request carries a valid session token. Signature and expiry only, no database read: the public
 * /status page uses it to choose its link and must keep rendering during a database outage.
 */
export async function hasValidSessionToken(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return (await verifySessionToken(token, getConfig().sessionSecret)) !== null;
}

export interface DemoSignIn {
  demoMode: boolean;
  accounts: ReadonlyArray<{ key: string; email: string; name: string; role: Role; hint: string }>;
}

/** The demo accounts for the sign-in cards and the "Switch demo user" menu; none outside demo mode (UX-5). */
export function getDemoSignIn(): DemoSignIn {
  const demoMode = getConfig().demoMode;
  return { demoMode, accounts: demoMode ? DEMO_ACCOUNTS : [] };
}
