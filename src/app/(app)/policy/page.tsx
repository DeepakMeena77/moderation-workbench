import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Policy - Moderation Workbench' };

export default async function PolicyPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.policy);
  if (!allowed) return <Forbidden role={actor.role} />;
  return (
    <PagePlaceholder
      title="Policy"
      description="Policy versions, clauses, compare and publish arrive in a later release."
    />
  );
}
