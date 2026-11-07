import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDemoSignIn, getPageActor } from '@/server/auth/guards';
import { SignInView } from '@/ui/features/auth/SignInView';
import { homeFor, safeNextPath } from '@/ui/shell/navigation';

export const metadata: Metadata = {
  title: 'Sign in - Moderation Workbench',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null);
  const actor = await getPageActor();
  if (actor) redirect(next ?? homeFor(actor.role));
  const { demoMode, accounts } = getDemoSignIn();
  return <SignInView demoMode={demoMode} accounts={accounts} next={next} />;
}
