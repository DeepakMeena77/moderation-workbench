import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Audit - Moderation Workbench' };

export default async function AuditPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.audit);
  if (!allowed) return <Forbidden role={actor.role} />;
  return (
    <PagePlaceholder title="Audit" description="The audit trail and its integrity check arrive in a later release." />
  );
}
