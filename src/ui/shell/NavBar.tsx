'use client';

import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Link from 'next/link';
import type { Role } from '../api/hooks';
import { m3 } from '../theme/theme';
import { barDestinations, isActive, moreDestinations } from './navigation';
import { NavItemContent, navItemSx } from './NavRail';

export const NAV_BAR_HEIGHT = 80;

// Compact windows, below 600 px (03 sec. 3.1): a bottom bar with up to 3 destinations plus "More".
export function NavBar({
  role,
  pathname,
  moreOpen,
  onOpenMore,
}: {
  role: Role;
  pathname: string;
  moreOpen: boolean;
  onOpenMore: () => void;
}) {
  // "More" shows as active when the current page is one of the destinations it holds.
  const moreActive = moreDestinations(role).some((destination) => isActive(destination.href, pathname));
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-nav="bar"
      sx={(theme) => ({
        display: { xs: 'flex', sm: 'none' },
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        height: NAV_BAR_HEIGHT,
        alignItems: 'center',
        px: 1,
        zIndex: theme.zIndex.appBar,
        backgroundColor: m3(theme).chrome,
      })}
    >
      {barDestinations(role).map(({ key, label, href, icon }) => {
        const active = isActive(href, pathname);
        return (
          <ButtonBase
            key={key}
            component={Link}
            href={href}
            aria-current={active ? 'page' : undefined}
            sx={[navItemSx, { flex: 1, minWidth: 0 }]}
          >
            <NavItemContent Icon={icon} label={label} active={active} indicatorWidth={64} />
          </ButtonBase>
        );
      })}
      <ButtonBase
        onClick={onOpenMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        sx={[navItemSx, { flex: 1, minWidth: 0 }]}
      >
        <NavItemContent Icon={MoreHorizRounded} label="More" active={moreActive} indicatorWidth={64} />
      </ButtonBase>
    </Box>
  );
}
