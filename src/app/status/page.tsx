import type { Metadata } from 'next';
import { StatusView } from '@/ui/features/status/StatusView';

export const metadata: Metadata = {
  title: 'System status - Moderation Workbench',
};

export default function StatusPage() {
  return <StatusView />;
}
