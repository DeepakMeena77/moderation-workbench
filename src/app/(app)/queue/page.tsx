import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Queue - Moderation Workbench' };

export default async function QueuePage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.queue);
  if (!allowed) return <Forbidden role={actor.role} />;
  return <PagePlaceholder title="Queue" description="The review queue and case decisions arrive in a later release." />;
}
