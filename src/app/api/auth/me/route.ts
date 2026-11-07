import { handle } from '@/server/http';

export const dynamic = 'force-dynamic';

// The signed-in user as the database knows them right now (the role is re-read on every request, SEC-1).
export const GET = handle({ route: 'GET /api/auth/me', auth: 'signed-in' }, async ({ actor }) => ({
  user: { id: actor.id, email: actor.email, name: actor.name, role: actor.role },
}));
