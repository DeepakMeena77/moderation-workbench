import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProviders } from '@/ui/AppProviders';

const roboto = Roboto({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: 'Moderation Workbench',
  description: 'AI-assisted content moderation. The AI recommends; humans decide.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The colour-scheme script sets a class on <html> before React hydrates, hence suppressHydrationWarning.
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
