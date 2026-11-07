'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import type { Role } from '../api/hooks';
import { layer, layout, m3 } from '../theme/theme';
import { isActive, railDestinations } from './navigation';

/**
 * Icon in an indicator above a label: the item shape shared by the navigation bar and rail (03 sec. 3.1). Active:
 * the neutral selected fill (radius 6) behind the icon, label in the main text colour at weight 500.
 */
export function NavItemContent({
  Icon,
  label,
  active,
  indicatorWidth,
}: {
  Icon: SvgIconComponent;
  label: string;
  active: boolean;
  indicatorWidth: 48 | 56;
}) {
  return (
    <>
      <Box
        className={active ? 'nav-indicator is-active' : 'nav-indicator'}
        sx={(theme) => ({
          width: indicatorWidth,
          height: 28,
          borderRadius: `${layout.controlRadius}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? m3(theme).selected : 'transparent',
          color: active ? m3(theme).onSurface : m3(theme).onSurfaceVariant,
          '& svg': { fontSize: 20 },
        })}
      >
        <Icon aria-hidden />
      </Box>
      <Typography
        variant="overline"
        component="span"
        sx={(theme) => ({
          color: active ? m3(theme).onSurface : m3(theme).onSurfaceVariant,
          fontWeight: active ? 500 : 400,
          textAlign: 'center',
        })}
      >
        {label}
      </Typography>
    </>
  );
}

/** A flat hover layer on the indicator only: the text colour mixed into its fill, never a gradient. */
export const navItemSx = (theme: Theme) => {
  const p = m3(theme);
  return {
    flexDirection: 'column',
    gap: 1,
    minHeight: 56,
    borderRadius: `${layout.controlRadius}px`,
    '&:hover .nav-indicator': { backgroundColor: layer(p.onSurface, 'transparent', 6) },
    '&:hover .nav-indicator.is-active': { backgroundColor: layer(p.onSurface, p.selected, 5) },
  } as const;
};

// Medium and expanded windows, 600-1199 px (03 sec. 3.1): 80 wide, white with a right hairline, icons with labels.
export function NavRail({ role, pathname }: { role: Role; pathname: string }) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-nav="rail"
      sx={(theme) => ({
        display: { xs: 'none', sm: 'flex', lg: 'none' },
        width: 80,
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
          alignItems: 'center',
          gap: 3,
          position: 'sticky',
          top: 0,
          height: '100dvh',
          overflowY: 'auto',
          pt: 4,
          pb: 4,
        }}
      >
        {railDestinations(role).map(({ key, label, href, icon }) => {
          const active = isActive(href, pathname);
          return (
            <ButtonBase
              key={key}
              component={Link}
              href={href}
              aria-current={active ? 'page' : undefined}
              sx={[navItemSx, { width: 72 }]}
            >
              <NavItemContent Icon={icon} label={label} active={active} indicatorWidth={48} />
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
