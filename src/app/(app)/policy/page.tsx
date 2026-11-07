import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { PolicyView } from '@/ui/features/policy/PolicyView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Policy - Moderation Workbench' };

export default async function PolicyPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.policy, '/policy');
  if (!allowed) return <Forbidden role={actor.role} />;
  // Everyone reads the policy; staff follow re-evaluation runs; only admins publish (02 sec. 7).
  return <PolicyView canPublish={actor.role === 'admin'} canSeeRuns={actor.role !== 'author'} />;
}
