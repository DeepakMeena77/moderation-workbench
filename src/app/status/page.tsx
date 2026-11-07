import type { Metadata } from 'next';
import { hasValidSessionToken } from '@/server/auth/guards';
import { StatusView } from '@/ui/features/status/StatusView';

export const metadata: Metadata = {
  title: 'System status - Moderation Workbench',
};

// Public (SEC-1). The session check reads only the cookie's signature, never the database, so this page still
// renders while the database is down.
export default async function StatusPage() {
  return <StatusView signedIn={await hasValidSessionToken()} />;
}
