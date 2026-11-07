'use client';

import LogoutRounded from '@mui/icons-material/LogoutRounded';
import SwitchAccountRounded from '@mui/icons-material/SwitchAccountRounded';
import Avatar from '@mui/material/Avatar';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState, type MouseEvent } from 'react';
import type { Me } from '../api/hooks';
import { IconButton } from '../components/IconButton';
import { m3 } from '../theme/theme';
import { ROLE_LABEL } from './navigation';
import { useThemeChoice } from './ThemeToggle';

// The avatar menu in the top app bar, at every width: theme, "Switch demo user" (demo mode) and sign out.
// It also covers the rail widths, where there is no drawer footer.
export function AccountMenu({
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;
  const close = () => setAnchor(null);
  const theme = useThemeChoice();

  return (
    <>
      <IconButton
        label={`Account: ${user.name}, ${ROLE_LABEL[user.role]}`}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'account-menu' : undefined}
      >
        <Avatar
          sx={(t) => ({
            width: 32,
            height: 32,
            backgroundColor: m3(t).primaryContainer,
            color: m3(t).onPrimaryContainer,
            ...t.typography.subtitle1,
          })}
        >
          {user.name.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu
        id="account-menu"
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          // The menu sits on the canvas-coloured app bar, so it takes surfaceContainerHigh (03 sec. 9).
          paper: { sx: (t) => ({ backgroundColor: m3(t).surfaceContainerHigh, borderRadius: '12px', minWidth: 220 }) },
        }}
      >
        {/* Stays open, so the new theme label is visible after the change. */}
        <MenuItem onClick={theme.cycle}>
          <ListItemIcon>
            <theme.Icon />
          </ListItemIcon>
          {theme.label}
        </MenuItem>
        {demoMode ? (
          <MenuItem
            onClick={() => {
              close();
              onSwitchUser();
            }}
          >
            <ListItemIcon>
              <SwitchAccountRounded />
            </ListItemIcon>
            Switch demo user
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            close();
            onSignOut();
          }}
        >
          <ListItemIcon>
            <LogoutRounded />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
