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
import { layout, m3 } from '../theme/theme';
import { drawerGroups, isActive } from './navigation';
import { ThemeToggleItem } from './ThemeToggle';

/** A full-width pill row, 48 high, for the compact "More" sheet (touch); active rows use secondaryContainer. */
export const pillRowSx = (theme: Theme) =>
  ({
    minHeight: 48,
    borderRadius: 9999,
    px: 4,
    color: m3(theme).onSurfaceVariant,
    '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 40 },
    '&[aria-current="page"]': {
      backgroundColor: m3(theme).secondaryContainer,
      color: m3(theme).onSecondaryContainer,
    },
  }) as const;

/**
 * A compact drawer row (03 sec. 3.1): no gap between rows, label in bodyMedium, icon 20. The active row is
 * filled with secondaryContainer and its label goes to weight 500.
 */
export const drawerRowSx = (theme: Theme) => {
  const layer = `color-mix(in srgb, ${m3(theme).onSurface} 8%, transparent)`;
  return {
    minHeight: layout.drawerItemHeight,
    py: 0,
    px: 3,
    borderRadius: `${layout.nestedRadius}px`,
    color: m3(theme).onSurface,
    '& .MuiListItemIcon-root': { color: m3(theme).onSurfaceVariant, minWidth: 36 },
    '& .MuiListItemIcon-root svg': { fontSize: 20 },
    '& .MuiListItemText-root': { my: 0 },
    '&:hover': { backgroundColor: layer },
    '&[aria-current="page"]': {
      backgroundColor: m3(theme).secondaryContainer,
      color: m3(theme).onSecondaryContainer,
      '& .MuiListItemIcon-root': { color: 'inherit' },
      '& .MuiListItemText-primary': { fontWeight: 500 },
    },
    '&[aria-current="page"]:hover': {
      backgroundColor: `color-mix(in srgb, ${m3(theme).onSecondaryContainer} 8%, ${m3(theme).secondaryContainer})`,
    },
  } as const;
};

const rowText = { primary: { variant: 'body2' } } as const;

// Large windows, 1200 px and up (03 sec. 3.1): a permanent drawer with grouped destinations. The header holds
// the product name, level with the top app bar; the footer holds the theme toggle and the demo-user switcher
// (03 sec. 3.2), in the same compact rows.
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
  const rowGutter = { px: 3 } as const;
  const headingIndent = 3;
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-nav="drawer"
      sx={(theme) => ({
        display: { xs: 'none', lg: 'flex' },
        width: layout.drawerWidth,
        flexShrink: 0,
        backgroundColor: m3(theme).chrome,
      })}
    >
      {/* The column is as tall as the page, so the chrome colour runs the full height; its content stays in view. */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100dvh',
          overflowY: 'auto',
          pb: 3,
        }}
      >
        <Box
          sx={{
            height: layout.appBarHeight,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            ...rowGutter,
          }}
        >
          <Typography variant="subtitle1" component="p" noWrap sx={{ pl: headingIndent }}>
            Moderation Workbench
          </Typography>
        </Box>
        {drawerGroups(role).map((group, index) => {
          const headingId = `nav-group-${group.label.toLowerCase()}`;
          return (
            <Box key={group.label} sx={rowGutter}>
              <Typography
                id={headingId}
                variant="overline"
                component="p"
                sx={{ pl: headingIndent, pt: index === 0 ? 1 : 4, pb: 1, color: 'text.secondary' }}
              >
                {group.label}
              </Typography>
              <List aria-labelledby={headingId} disablePadding>
                {group.items.map(({ key, label, href, icon: Icon }) => (
                  <ListItem key={key} disablePadding>
                    <ListItemButton
                      component={Link}
                      href={href}
                      aria-current={isActive(href, pathname) ? 'page' : undefined}
                      sx={drawerRowSx}
                    >
                      <ListItemIcon>
                        <Icon />
                      </ListItemIcon>
                      <ListItemText primary={label} slotProps={rowText} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          );
        })}
        <List sx={{ mt: 'auto', pt: 4, ...rowGutter }} disablePadding aria-label="Preferences">
          <ListItem disablePadding>
            <ThemeToggleItem sx={drawerRowSx} textVariant="body2" />
          </ListItem>
          {demoMode ? (
            <ListItem disablePadding>
              <ListItemButton onClick={onSwitchUser} aria-haspopup="dialog" sx={drawerRowSx}>
                <ListItemIcon>
                  <SwitchAccountRounded />
                </ListItemIcon>
                <ListItemText primary="Switch demo user" slotProps={rowText} />
              </ListItemButton>
            </ListItem>
          ) : null}
        </List>
      </Box>
    </Box>
  );
}
