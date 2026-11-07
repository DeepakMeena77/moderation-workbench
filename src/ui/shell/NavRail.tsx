'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import type { Role } from '../api/hooks';
import { m3 } from '../theme/theme';
import { isActive, railDestinations } from './navigation';

/**
 * Icon in a pill indicator above a label: the item shape shared by the navigation bar and rail
 * (03 sec. 3.1). Active: secondaryContainer indicator, label in onSurface.
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
  indicatorWidth: 56 | 64;
}) {
  return (
    <>
      <Box
        className="nav-indicator"
        sx={(theme) => ({
          width: indicatorWidth,
          height: 32,
          borderRadius: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? m3(theme).secondaryContainer : 'transparent',
          color: active ? m3(theme).onSecondaryContainer : m3(theme).onSurfaceVariant,
        })}
      >
        <Icon aria-hidden />
      </Box>
      <Typography
        variant="overline"
        component="span"
        sx={(theme) => ({ color: active ? m3(theme).onSurface : m3(theme).onSurfaceVariant, textAlign: 'center' })}
      >
        {label}
      </Typography>
    </>
  );
}

/**
 * Hover state layer (onSurface at 8%, 03 sec. 2.5) on the indicator only, as M3 specifies for bar and rail
 * items. A gradient layer sits on top of whatever the indicator colour is, active or not.
 */
export const navItemSx = (theme: Theme) => {
  const layer = `color-mix(in srgb, ${m3(theme).onSurface} 8%, transparent)`;
  return {
    flexDirection: 'column',
    gap: 1,
    minHeight: 56,
    borderRadius: '12px',
    '&:hover .nav-indicator': { backgroundImage: `linear-gradient(${layer}, ${layer})` },
  } as const;
};

// Medium and expanded windows, 600-1199 px (03 sec. 3.1): 80 dp wide, icons with labels.
export function NavRail({ role, pathname }: { role: Role; pathname: string }) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-nav="rail"
      sx={(theme) => ({
        display: { xs: 'none', sm: 'flex', lg: 'none' },
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        width: 80,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100dvh',
        overflowY: 'auto',
        pt: 4,
        pb: 4,
        backgroundColor: m3(theme).canvas,
      })}
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
            <NavItemContent Icon={icon} label={label} active={active} indicatorWidth={56} />
          </ButtonBase>
        );
      })}
    </Box>
  );
}
