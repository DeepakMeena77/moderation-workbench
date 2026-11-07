import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Feed - Moderation Workbench' };

export default async function FeedPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.feed);
  if (!allowed) return <Forbidden role={actor.role} />;
  return (
    <PagePlaceholder
      title="Feed"
      description="Community posts, comments and reporting arrive in a later release."
      reading
    />
  );
}
