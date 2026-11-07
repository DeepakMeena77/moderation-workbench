import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { QueueView } from '@/ui/features/queue/QueueView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Case review - Moderation Workbench' };

// The case page (03 sec. 6.6). From 840 px it opens beside the queue list (list-detail, 03 sec. 5.1).
export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.queue);
  if (!allowed) return <Forbidden role={actor.role} />;
  const { caseId } = await params;
  return <QueueView selectedId={caseId} />;
}
