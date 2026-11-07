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

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <Box
      data-ui="stack"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2, py: 8 }}
    >
      <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex', '& svg': { fontSize: 48 } }}>
        {icon ?? <InboxRounded />}
      </Box>
      <Typography variant="h3" component="p">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      ) : null}
      {action}
    </Box>
  );
}
