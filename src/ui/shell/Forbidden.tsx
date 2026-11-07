'use client';

import BlockRounded from '@mui/icons-material/BlockRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Role } from '../api/hooks';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { homeFor, railDestinations, ROLE_LABEL } from './navigation';

// 403 inside the shell (03 sec. 6.13): the page exists, but this role may not open it (SEC-1).
export function Forbidden({ role }: { role: Role }) {
  const home = homeFor(role);
  const homeLabel = railDestinations(role).find((destination) => destination.href === home)?.label ?? 'the start page';
  return (
    <Box data-ui="section" sx={{ px: { xs: 4, sm: 6 }, py: 6 }}>
      <Card sx={{ maxWidth: 680, mx: 'auto' }}>
        <Box
          data-ui="stack"
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, py: 6 }}
        >
          <BlockRounded aria-hidden sx={{ fontSize: 48, color: 'text.secondary' }} />
          <Typography variant="h1">You don&apos;t have access to this</Typography>
          <Typography variant="body2" color="text.secondary">
            Your role ({ROLE_LABEL[role]}) can&apos;t open this page. Use the navigation to go to a page you can use.
          </Typography>
          <Button variant="tonal" href={home}>
            Go to {homeLabel}
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
