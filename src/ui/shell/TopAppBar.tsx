'use client';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { Me } from '../api/hooks';
import { Tag } from '../components/Tag';
import { layout, m3 } from '../theme/theme';
import { AccountMenu } from './AccountMenu';
import { ROLE_LABEL } from './navigation';

// Top app bar (03 sec. 4): 64 high on the chrome colour (white in light), with the product name in titleMedium.
// The page title is the page's own h1, close under this bar.
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
  return (
    <AppBar
      position="sticky"
      sx={(theme) => ({
        backgroundColor: m3(theme).chrome,
        color: m3(theme).onSurface,
        boxShadow: 'none',
      })}
    >
      <Toolbar
        disableGutters
        sx={{ height: layout.appBarHeight, minHeight: layout.appBarHeight, gap: 2, px: { xs: 2, sm: 4 } }}
      >
        {/* From 1200 px the product name sits at the top of the drawer, level with this bar. */}
        <Typography
          variant="subtitle1"
          component="p"
          noWrap
          sx={{ flex: 1, minWidth: 0, pl: { xs: 2, sm: 0 }, visibility: { lg: 'hidden' } }}
        >
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
