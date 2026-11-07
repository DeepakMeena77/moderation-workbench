import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { AppealsView } from '@/ui/features/appeals/AppealsView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Appeal review - Moderation Workbench' };

// The appeal review (03 sec. 6.8). From 840 px it opens beside the appeals list (list-detail, 03 sec. 5.1).
export default async function AppealReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.appeals);
  if (!allowed) return <Forbidden role={actor.role} />;
  const { id } = await params;
  return <AppealsView selectedId={id} />;
}
