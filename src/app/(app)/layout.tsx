import type { ReactNode } from 'react';
import { getDemoSignIn, requirePageActor } from '@/server/auth/guards';
import { AppShell } from '@/ui/shell/AppShell';

// Every signed-in page renders inside the shell. The user and role are re-read from the database here, before
// anything renders (SEC-1); without a valid session this redirects to sign-in.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor();
  const { accounts } = getDemoSignIn();
  return (
    <AppShell user={{ id: actor.id, email: actor.email, name: actor.name, role: actor.role }} demoAccounts={accounts}>
      {children}
    </AppShell>
  );
}
