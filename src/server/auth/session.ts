import type { Role } from '@prisma/client';
import { getConfig } from '../config';
import { getDb } from '../db';
import { readSessionToken, verifySessionToken } from './token';

// getActor() (docs/02-system-design.md sec. 10): the token only names the user; who they are and what role
// they hold is read from the database on every request, so a role change or a deleted user takes effect
// on the very next request (SEC-1).

export interface Actor {
  type: 'human';
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function getActorFromToken(token: string | null): Promise<Actor | null> {
  if (!token) return null;
  const userId = await verifySessionToken(token, getConfig().sessionSecret);
  if (!userId) return null;
  const user = await getDb().user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  return user ? { type: 'human', ...user } : null;
}

export function getActor(req: Request): Promise<Actor | null> {
  return getActorFromToken(readSessionToken(req.headers.get('cookie')));
}
