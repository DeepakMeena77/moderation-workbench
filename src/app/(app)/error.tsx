'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ErrorState } from '@/ui/components/ErrorState';

// Error boundary for signed-in pages (03 sec. 6.13): what happened, Retry, and a reference to quote. A render
// error has no API request ID, so the reference is Next.js's error digest, which matches the server log.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Box data-ui="section" sx={{ px: { xs: 4, sm: 6 }, py: 6 }}>
      <Typography variant="h1" sx={{ textAlign: 'center' }}>
        Something went wrong
      </Typography>
      <ErrorState error={error} onRetry={reset} />
      {error.digest ? (
        <Typography variant="caption" component="p" color="text.secondary" sx={{ textAlign: 'center' }}>
          Reference: {error.digest}
        </Typography>
      ) : null}
    </Box>
  );
}
