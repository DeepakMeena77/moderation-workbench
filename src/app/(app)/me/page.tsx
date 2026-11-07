import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'My content - Moderation Workbench' };

export default async function MyContentPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.me);
  if (!allowed) return <Forbidden role={actor.role} />;
  return (
    <PagePlaceholder
      title="My content"
      description="Your posts, their moderation status and appeals arrive in a later release."
      reading
    />
  );
}
