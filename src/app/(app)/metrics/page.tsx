import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';
import { PagePlaceholder } from '@/ui/shell/PagePlaceholder';

export const metadata: Metadata = { title: 'Metrics - Moderation Workbench' };

export default async function MetricsPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.metrics);
  if (!allowed) return <Forbidden role={actor.role} />;
  return (
    <PagePlaceholder
      title="Metrics"
      description="AI and human agreement, overrides, failures and cost arrive in a later release."
    />
  );
}
