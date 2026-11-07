import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { QueueView } from '@/ui/features/queue/QueueView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Queue - Moderation Workbench' };

export default async function QueuePage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.queue, '/queue');
  if (!allowed) return <Forbidden role={actor.role} />;
  return <QueueView selectedId={null} />;
}
