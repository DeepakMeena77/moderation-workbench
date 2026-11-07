import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { AuditView } from '@/ui/features/audit/AuditView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Audit - Moderation Workbench' };

export default async function AuditPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.audit, '/audit');
  if (!allowed) return <Forbidden role={actor.role} />;
  return <AuditView />;
}
