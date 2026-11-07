'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card } from '@/ui/components/Card';
import { ErrorState } from '@/ui/components/ErrorState';
import { layout, pageSx, titleGap } from '@/ui/theme/theme';

// Error boundary for signed-in pages (03 sec. 6.13): what happened, Retry, and a reference to quote. A render
// error has no API request ID, so the reference is Next.js's error digest, which matches the server log.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Box data-ui="section" sx={pageSx}>
      <Typography variant="h1" sx={{ mb: titleGap }}>
        Something went wrong
      </Typography>
      <Card sx={{ maxWidth: layout.readingWidth }}>
        <ErrorState error={error} onRetry={reset} />
        {error.digest ? (
          <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 2 }}>
            Reference: {error.digest}
          </Typography>
        ) : null}
      </Card>
    </Box>
  );
}
