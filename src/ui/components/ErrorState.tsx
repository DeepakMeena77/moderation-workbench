import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ApiError } from '../api/client';
import { Button } from './Button';

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}

// Says what happened and what to do next, with the request ID for support (03 sec. 4 and sec. 7).
// A 409 means the data changed underneath the user, so the action is Reload rather than Retry.
export function ErrorState({ error, onRetry, retrying = false }: ErrorStateProps) {
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError?.message ?? 'Something went wrong. Try again.';
  const actionLabel = apiError?.status === 409 ? 'Reload' : 'Retry';

  return (
    <Box role="alert" data-ui="stack" sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, py: 1 }}>
      <ErrorOutlineRounded aria-hidden sx={{ fontSize: 20, color: 'error.main' }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        <Typography variant="h3" component="p" sx={{ overflowWrap: 'anywhere' }}>
          {message}
        </Typography>
        {apiError?.requestId ? (
          <Typography variant="caption" color="text.secondary">
            Request ID: {apiError.requestId}
          </Typography>
        ) : null}
        {onRetry ? (
          <Box sx={{ mt: 1 }}>
            <Button variant="tonal" onClick={onRetry} loading={retrying}>
              {actionLabel}
            </Button>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
