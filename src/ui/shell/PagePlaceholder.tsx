'use client';

import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';

// Stand-in body for a destination whose screen arrives in a later slice. It keeps every navigation target
// real (keyboard, layout and access checks run against it) and is replaced page by page.
export function PagePlaceholder({
  title,
  description,
  reading = false,
}: {
  title: string;
  description: string;
  /** Reading pages (feed, my content) are 680 wide and centred; work pages are fluid (03 sec. 5). */
  reading?: boolean;
}) {
  return (
    <Box data-ui="section" sx={{ px: { xs: 4, sm: 6 }, py: 6 }}>
      <Box sx={{ maxWidth: reading ? 680 : 'none', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
