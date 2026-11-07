import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Appeals - Moderation Workbench' };

export default async function AppealsPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.appeals);
  if (!allowed) return <Forbidden role={actor.role} />;
  return <PagePlaceholder title="Appeals" description="Appeals and second review arrive in a later release." />;
}
