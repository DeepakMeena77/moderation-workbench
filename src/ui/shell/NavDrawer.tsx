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
import { layer, layout, m3 } from '../theme/theme';
import { drawerGroups, isActive } from './navigation';
import { ThemeToggleItem } from './ThemeToggle';
import { BrandLockup } from '../components/BrandMark';

/** A More-sheet row (phones): 44 high for touch, radius 6, selected = the neutral selected fill and darker text. */
export const pillRowSx = (theme: Theme) =>
  ({
    minHeight: layout.touchTarget,
    borderRadius: `${layout.controlRadius}px`,
    px: 3,
    color: m3(theme).onSurface,
    '& .MuiListItemIcon-root': { color: m3(theme).onSurfaceVariant, minWidth: 32 },
    '& .MuiListItemIcon-root svg': { fontSize: 18 },
    '&[aria-current="page"]': {
      backgroundColor: m3(theme).selected,
      '& .MuiListItemText-primary': { fontWeight: 500 },
    },
  }) as const;

/**
 * A sidebar row (03 sec. 3.1): 32 high, radius 8, 2 px between rows, an 18 px monochrome icon and the label in
 * body text. The selected row takes the neutral selected fill (a rounded highlight), darker text at weight 500.
 */
export const drawerRowSx = (theme: Theme) => {
  const p = m3(theme);
  return {
    position: 'relative',
    minHeight: layout.drawerItemHeight,
    py: 0,
    px: 3,
    mb: 0.5,
    borderRadius: `${layout.cardRadius}px`,
    color: p.onSurfaceVariant,
    '& .MuiListItemIcon-root': { color: p.onSurfaceVariant, minWidth: 28 },
    '& .MuiListItemIcon-root svg': { fontSize: 18 },
    '& .MuiListItemText-root': { my: 0 },
    '&:hover': { backgroundColor: layer(p.onSurface, 'transparent', 5), color: p.onSurface },
    '&[aria-current="page"]': {
      backgroundColor: p.selected,
      color: p.onSurface,
      '& .MuiListItemIcon-root': { color: p.onSurface },
      '& .MuiListItemText-primary': { fontWeight: 500 },
    },
    '&[aria-current="page"]:hover': { backgroundColor: layer(p.onSurface, p.selected, 4) },
  } as const;
};

const rowText = { primary: { variant: 'body2' } } as const;

// Large windows, 1200 px and up (03 sec. 3.1): a permanent white sidebar with a right hairline and grouped
// destinations. The header holds the product name, level with the top bar; the footer holds the theme toggle and
// the demo-user switcher (03 sec. 3.2), in the same rows.
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
        borderRight: `1px solid ${m3(theme).border}`,
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
          sx={(t) => ({
            height: layout.appBarHeight,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${m3(t).border}`,
            mb: 2,
            ...rowGutter,
          })}
        >
          <Typography variant="subtitle1" component="p" noWrap sx={{ pl: headingIndent }}>
            <BrandLockup>Moderation Workbench</BrandLockup>
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
                sx={(t) => ({ pl: headingIndent, pt: index === 0 ? 2 : 5, pb: 1, color: m3(t).textTertiary })}
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
