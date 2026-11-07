'use client';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import type { Me } from '../api/hooks';
import { Tag } from '../components/Tag';
import { m3 } from '../theme/theme';
import { AccountMenu } from './AccountMenu';
import { ROLE_LABEL } from './navigation';

// Top app bar (03 sec. 4): 64 high on the canvas colour. When the page scrolls it changes to
// surfaceContainer, a tonal change instead of a shadow. Page titles are the page's own h1.
export function TopAppBar({
  user,
  demoMode,
  onSwitchUser,
  onSignOut,
}: {
  user: Me;
  demoMode: boolean;
  onSwitchUser: () => void;
  onSignOut: () => void;
}) {
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 0 });
  return (
    <AppBar
      position="sticky"
      sx={(theme) => ({
        backgroundColor: scrolled ? m3(theme).surfaceContainer : m3(theme).canvas,
        color: m3(theme).onSurface,
        boxShadow: 'none',
      })}
    >
      <Toolbar disableGutters sx={{ height: 64, gap: 2, px: { xs: 2, sm: 4 } }}>
        <Typography variant="h2" component="p" noWrap sx={{ flex: 1, minWidth: 0, pl: { xs: 2, sm: 0 } }}>
          Moderation Workbench
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          <Tag label={ROLE_LABEL[user.role]} tone="secondary" />
        </Box>
        <AccountMenu user={user} demoMode={demoMode} onSwitchUser={onSwitchUser} onSignOut={onSignOut} />
      </Toolbar>
    </AppBar>
  );
}
