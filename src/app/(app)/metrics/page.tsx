import type { Metadata } from 'next';
import { getPageAccess } from '@/server/auth/guards';
import { MetricsView } from '@/ui/features/metrics/MetricsView';
import { Forbidden } from '@/ui/shell/Forbidden';
import { PAGE_ROLES } from '@/ui/shell/navigation';

export const metadata: Metadata = { title: 'Metrics - Moderation Workbench' };

export default async function MetricsPage() {
  const { actor, allowed } = await getPageAccess(PAGE_ROLES.metrics, '/metrics');
  if (!allowed) return <Forbidden role={actor.role} />;
  return <MetricsView />;
}
