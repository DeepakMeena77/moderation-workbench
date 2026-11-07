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

// Row list (03 sec. 4): one bordered panel that holds rows edge to edge, with a 1 px hairline between rows. Feed,
// queue, appeals, audit (below 840 px), failed jobs.
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
          '& > *:not(:first-of-type)': { borderTop: `1px solid ${m3(theme).border}` },
        })}
      >
        {children}
      </Box>
    </Card>
  );
}
