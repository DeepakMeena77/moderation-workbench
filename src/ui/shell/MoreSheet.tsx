'use client';

import LogoutRounded from '@mui/icons-material/LogoutRounded';
import SwitchAccountRounded from '@mui/icons-material/SwitchAccountRounded';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import type { Role } from '../api/hooks';
import { m3 } from '../theme/theme';
import { isActive, moreDestinations } from './navigation';
import { pillRowSx } from './NavDrawer';
import { ThemeToggleItem } from './ThemeToggle';

// The compact "More" menu as a modal bottom sheet (03 sec. 3.2): the destinations the bar has no room for,
// the theme toggle, "Switch demo user" in demo mode, and sign out. Esc and the scrim close it, and focus
// returns to the "More" button (MUI Modal restores focus to the trigger).
export function MoreSheet({
  open,
  onClose,
  role,
  pathname,
  demoMode,
  onSwitchUser,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  pathname: string;
  demoMode: boolean;
  onSwitchUser: () => void;
  onSignOut: () => void;
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': 'more-sheet-title',
          sx: (theme) => ({
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: m3(theme).surfaceContainerLow,
            px: 3,
            pb: 6,
          }),
        },
      }}
    >
      <Box
        aria-hidden
        sx={(theme) => ({
          width: 32,
          height: 4,
          borderRadius: 9999,
          mx: 'auto',
          mt: 4,
          mb: 2,
          backgroundColor: m3(theme).onSurfaceVariant,
          opacity: 0.4,
        })}
      />
      <Typography id="more-sheet-title" variant="h3" component="h2" sx={{ px: 4, py: 3 }}>
        More
      </Typography>
      <List disablePadding>
        {moreDestinations(role).map(({ key, label, href, icon: Icon }) => (
          <ListItem key={key} disablePadding>
            <ListItemButton
              component={Link}
              href={href}
              onClick={onClose}
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
        <ListItem disablePadding>
          <ListItemButton onClick={onSignOut} sx={pillRowSx}>
            <ListItemIcon>
              <LogoutRounded />
            </ListItemIcon>
            <ListItemText primary="Sign out" slotProps={{ primary: { variant: 'button' } }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}
