import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { AppealsView } from '@/ui/features/appeals/AppealsView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Appeals - Moderation Workbench' };

// The appeals list (03 sec. 6.7). Senior moderators review; moderators and admins read.
export default async function AppealsPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.appeals);
  if (!allowed) return <Forbidden role={actor.role} />;
  return <AppealsView selectedId={null} />;
}
