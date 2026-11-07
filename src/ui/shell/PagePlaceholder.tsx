'use client';

import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { layout, pageSx, titleGap } from '../theme/theme';

// Stand-in body for a destination whose screen arrives in a later slice. It keeps every navigation target
// real (keyboard, layout and access checks run against it) and is replaced page by page.
export function PagePlaceholder({
  title,
  description,
  reading = false,
}: {
  title: string;
  description: string;
  /** Reading pages (feed, my content) have a max width and start next to the navigation (03 sec. 5). */
  reading?: boolean;
}) {
  return (
    <Box data-ui="section" sx={pageSx}>
      <Box
        sx={{
          maxWidth: reading ? layout.readingWidth : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: titleGap,
        }}
      >
        <Typography variant="h1">{title}</Typography>
        <Card>
          <EmptyState
            icon={<ConstructionRounded />}
            title={`${title} is not available yet`}
            description={description}
          />
        </Card>
      </Box>
    </Box>
  );
}
