import { redirect } from 'next/navigation';
import { getPageActor } from '@/server/auth/guards';
import { homeFor } from '@/ui/shell/navigation';

// The start page is the signed-in user's home destination, or sign-in.
export default async function Home(): Promise<never> {
  const actor = await getPageActor();
  redirect(actor ? homeFor(actor.role) : '/sign-in');
}
