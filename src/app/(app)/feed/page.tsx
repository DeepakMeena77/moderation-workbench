import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { FeedView } from '@/ui/features/feed/FeedView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Feed - Moderation Workbench' };

export default async function FeedPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.feed);
  if (!allowed) return <Forbidden role={actor.role} />;
  // Everyone reads the feed; only authors post and comment (02 sec. 7).
  return <FeedView canPost={actor.role === 'author'} />;
}
