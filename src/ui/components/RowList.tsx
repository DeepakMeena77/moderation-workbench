import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { m3 } from '../theme/theme';
import { Card } from './Card';

export interface RowListProps {
  children: ReactNode;
  /** A list (ul) when the rows are list items, otherwise a plain group. */
  component?: 'ul' | 'div';
  'aria-label'?: string;
}

// Row list (03 sec. 4): one card-coloured region that holds rows edge to edge, split by a 1 px tonal step (the
// region's surfaceContainerHigh showing between the rows), not by divider lines. Feed, queue, appeals, my content.
export function RowList({ children, component = 'div', 'aria-label': ariaLabel }: RowListProps) {
  return (
    <Card sx={{ p: { xs: 0, md: 0 }, overflow: 'hidden' }}>
      <Box
        component={component}
        aria-label={ariaLabel}
        sx={(theme) => ({
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          backgroundColor: m3(theme).surfaceContainerHigh,
        })}
      >
        {children}
      </Box>
    </Card>
  );
}
