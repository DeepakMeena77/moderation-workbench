'use client';

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { Me } from '../api/hooks';
import { Tag } from '../components/Tag';
import { layout, m3 } from '../theme/theme';
import { AccountMenu } from './AccountMenu';
import { pageTrail, ROLE_LABEL } from './navigation';

// Top bar (03 sec. 3.1 and sec. 4): 56 high including its bottom hairline, white. On the left the current page as a
// short breadcrumb ("Queue / Case"), or the product name on phones; on the right the role badge and the account
// menu. The page's own h1 stays the page title.
export function TopAppBar({
  user,
  pathname,
  demoMode,
  onSwitchUser,
  onSignOut,
}: {
  user: Me;
  pathname: string;
  demoMode: boolean;
  onSwitchUser: () => void;
  onSignOut: () => void;
}) {
  const trail = pageTrail(pathname);
  return (
    <AppBar
      position="sticky"
      sx={(theme) => ({
        backgroundColor: m3(theme).chrome,
        color: m3(theme).onSurface,
        boxShadow: 'none',
        borderBottom: `1px solid ${m3(theme).border}`,
      })}
    >
      <Toolbar
        disableGutters
        sx={{
          // A responsive value, so it also wins over MUI's 64 px min-height from 600 px.
          height: layout.appBarHeight - 1,
          minHeight: { xs: layout.appBarHeight - 1, sm: layout.appBarHeight - 1 },
          gap: 3,
          px: { xs: 4, sm: 6 },
        }}
      >
        {/* Phones name the product; from 600 px the bar names the current page instead (the sidebar header carries
            the product name from 1200 px). */}
        <Typography variant="subtitle1" component="p" noWrap sx={{ display: { sm: 'none' }, flex: 1, minWidth: 0 }}>
          Moderation Workbench
        </Typography>
        <Typography
          component="p"
          noWrap
          sx={(theme) => ({
            display: { xs: 'none', sm: 'block' },
            flex: 1,
            minWidth: 0,
            ...theme.typography.body2,
            color: m3(theme).onSurfaceVariant,
          })}
        >
          {trail.map((part, index) => (
            <Box component="span" key={part}>
              {index > 0 ? (
                <Box component="span" aria-hidden sx={(theme) => ({ px: 2, color: m3(theme).textTertiary })}>
                  /
                </Box>
              ) : null}
              <Box
                component="span"
                sx={(theme) => (index === trail.length - 1 ? { color: m3(theme).onSurface, fontWeight: 500 } : {})}
              >
                {part}
              </Box>
            </Box>
          ))}
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          <Tag label={ROLE_LABEL[user.role]} />
        </Box>
        <AccountMenu user={user} demoMode={demoMode} onSwitchUser={onSwitchUser} onSignOut={onSignOut} />
      </Toolbar>
    </AppBar>
  );
}
