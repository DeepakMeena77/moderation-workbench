'use client';

import BlockRounded from '@mui/icons-material/BlockRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Role } from '../api/hooks';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { layout, pageSx } from '../theme/theme';
import { homeFor, railDestinations, ROLE_LABEL } from './navigation';

// 403 inside the shell (03 sec. 6.13): the page exists, but this role may not open it (SEC-1).
export function Forbidden({ role }: { role: Role }) {
  const home = homeFor(role);
  const homeLabel = railDestinations(role).find((destination) => destination.href === home)?.label ?? 'the start page';
  return (
    <Box data-ui="section" sx={pageSx}>
      <PageHeader
        section="System"
        title="You don't have access to this"
        description="The page exists, but your role can't open it."
        maxWidth={layout.readingWidth}
      />
      <Card sx={{ maxWidth: layout.readingWidth }}>
        <Box data-ui="stack" sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          <BlockRounded aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
            <Typography variant="body2">
              Your role ({ROLE_LABEL[role]}) can&apos;t open this page. Use the navigation to go to a page you can use.
            </Typography>
            <Button variant="secondary" href={home}>
              Go to {homeLabel}
            </Button>
          </Box>
        </Box>
      </Card>
    </Box>
  );
}
