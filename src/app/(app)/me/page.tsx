import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { MyContentView } from '@/ui/features/me/MyContentView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'My content - Moderation Workbench' };

// My content (03 sec. 6.3): the author's items, decisions and appeals.
export default async function MyContentPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.me);
  if (!allowed) return <Forbidden role={actor.role} />;
  return <MyContentView />;
}
