import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { AppProviders } from '@/ui/AppProviders';

// Self-hosted from @fontsource/roboto, so builds never depend on downloading fonts from Google at build time.
const roboto = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource/roboto/files/roboto-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
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
