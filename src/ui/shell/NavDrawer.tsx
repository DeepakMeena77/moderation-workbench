'use client';

import SwitchAccountRounded from '@mui/icons-material/SwitchAccountRounded';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import type { Role } from '../api/hooks';
import { m3 } from '../theme/theme';
import { drawerGroups, isActive } from './navigation';
import { ThemeToggleItem } from './ThemeToggle';

/** A full-width pill row, 56 high (03 sec. 3.1); active rows use secondaryContainer. */
export const pillRowSx = (theme: Theme) =>
  ({
    minHeight: 56,
    borderRadius: 9999,
    px: 4,
    color: m3(theme).onSurfaceVariant,
    '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 40 },
    '&[aria-current="page"]': {
      backgroundColor: m3(theme).secondaryContainer,
      color: m3(theme).onSecondaryContainer,
    },
  }) as const;

// Large windows, 1200 px and up (03 sec. 3.1): a permanent 280 dp drawer with grouped destinations. The
// footer holds the theme toggle and the demo-user switcher (03 sec. 3.2).
export function NavDrawer({
  role,
  pathname,
  demoMode,
  onSwitchUser,
}: {
  role: Role;
  pathname: string;
  demoMode: boolean;
  onSwitchUser: () => void;
}) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-nav="drawer"
      sx={(theme) => ({
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        width: 280,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100dvh',
        overflowY: 'auto',
        px: 3,
        py: 4,
        backgroundColor: m3(theme).canvas,
      })}
    >
      {drawerGroups(role).map((group) => {
        const headingId = `nav-group-${group.label.toLowerCase()}`;
        return (
          <Box key={group.label} sx={{ mb: 2 }}>
            <Typography id={headingId} variant="h4" component="p" sx={{ px: 4, py: 3, color: 'text.secondary' }}>
              {group.label}
            </Typography>
            <List aria-labelledby={headingId} disablePadding>
              {group.items.map(({ key, label, href, icon: Icon }) => (
                <ListItem key={key} disablePadding>
                  <ListItemButton
                    component={Link}
                    href={href}
                    aria-current={isActive(href, pathname) ? 'page' : undefined}
                    sx={pillRowSx}
                  >
                    <ListItemIcon>
                      <Icon />
                    </ListItemIcon>
                    <ListItemText primary={label} slotProps={{ primary: { variant: 'button' } }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        );
      })}
      <List sx={{ mt: 'auto', pt: 4 }} disablePadding aria-label="Preferences">
        <ListItem disablePadding>
          <ThemeToggleItem sx={pillRowSx} />
        </ListItem>
        {demoMode ? (
          <ListItem disablePadding>
            <ListItemButton onClick={onSwitchUser} aria-haspopup="dialog" sx={pillRowSx}>
              <ListItemIcon>
                <SwitchAccountRounded />
              </ListItemIcon>
              <ListItemText primary="Switch demo user" slotProps={{ primary: { variant: 'button' } }} />
            </ListItemButton>
          </ListItem>
        ) : null}
      </List>
    </Box>
  );
}
