import type { Metadata } from 'next';
import { requirePageActor } from '@/server/auth/guards';
import { HistoryView } from '@/ui/features/history/HistoryView';

export const metadata: Metadata = { title: 'Moderation history - Moderation Workbench' };

// The moderation history (03 sec. 6.4, CNT-4). Any signed-in user may open the page; the API decides per item who
// sees what (staff: full view, the author: plain view, anyone else: 403, SEC-2).
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const { id } = await params;
  return <HistoryView contentId={id} />;
}
