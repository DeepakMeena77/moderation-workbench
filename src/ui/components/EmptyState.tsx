import InboxRounded from '@mui/icons-material/InboxRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactElement;
  /** Optional next action, usually a tonal Button (03 sec. 7). */
  action?: ReactNode;
}

// Empty state (03 sec. 4 and sec. 7): left-aligned, a 20 dp icon beside a short title, one line of help and an
// optional next action. Compact, so an empty list reads as a state of the page, not as an illustration.
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <Box data-ui="stack" sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, py: 1 }}>
      <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex', '& svg': { fontSize: 20 } }}>
        {icon ?? <InboxRounded />}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        <Typography variant="h3" component="p">
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        ) : null}
        {action ? <Box sx={{ mt: 1 }}>{action}</Box> : null}
      </Box>
    </Box>
  );
}
