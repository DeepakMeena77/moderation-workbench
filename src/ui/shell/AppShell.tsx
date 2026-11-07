'use client';

import Box from '@mui/material/Box';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useAfterAuthChange, useSignOut, type DemoAccount, type Me } from '../api/hooks';
import { useSnackbar } from '../components/SnackbarProvider';
import { m3 } from '../theme/theme';
import { DemoUserSwitcher } from './DemoUserSwitcher';
import { MoreSheet } from './MoreSheet';
import { NAV_BAR_HEIGHT, NavBar } from './NavBar';
import { NavDrawer } from './NavDrawer';
import { NavRail } from './NavRail';
import { TopAppBar } from './TopAppBar';

export interface AppShellProps {
  user: Me;
  /** Empty outside demo mode, which also hides "Switch demo user" (UX-5). */
  demoAccounts: readonly DemoAccount[];
  children: ReactNode;
}

// The signed-in app shell (03 sec. 3 and sec. 5, UX-2). All three navigation variants are rendered and CSS
// shows exactly one per width class, so the server markup is already right and nothing jumps after
// hydration: bar below 600, rail from 600 to 1199, drawer from 1200.
export function AppShell({ user, demoAccounts, children }: AppShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const signOut = useSignOut();
  const afterAuthChange = useAfterAuthChange();
  const notify = useSnackbar();
  const demoMode = demoAccounts.length > 0;

  const handleSignOut = () => {
    setMoreOpen(false);
    signOut.mutate(undefined, {
      onSuccess: () => afterAuthChange('/sign-in'),
      onError: (error) => {
        // An expired session is already signed out as far as the server is concerned.
        if (error instanceof ApiError && error.status === 401) afterAuthChange('/sign-in');
        else notify("Couldn't sign out. Try again.");
      },
    });
  };

  const openSwitcher = () => {
    setMoreOpen(false);
    setSwitcherOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <Box
        component="a"
        href="#content"
        sx={(theme) => ({
          position: 'absolute',
          left: 8,
          top: -64,
          zIndex: theme.zIndex.tooltip,
          px: 4,
          py: 2,
          borderRadius: '6px',
          backgroundColor: m3(theme).card,
          color: m3(theme).primary,
          ...theme.typography.button,
          '&:focus': { top: 8 },
        })}
      >
        Skip to content
      </Box>
      <NavRail role={user.role} pathname={pathname} />
      <NavDrawer role={user.role} pathname={pathname} demoMode={demoMode} onSwitchUser={openSwitcher} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopAppBar
          user={user}
          pathname={pathname}
          demoMode={demoMode}
          onSwitchUser={openSwitcher}
          onSignOut={handleSignOut}
        />
        <Box
          component="main"
          id="content"
          tabIndex={-1}
          // Room for the fixed bottom bar (64) plus 16 on compact screens, so the last element stays
          // reachable. Theme spacing units: 20 x 4 px = 80 px.
          sx={{ flex: 1, minWidth: 0, pb: { xs: (NAV_BAR_HEIGHT + 16) / 4, sm: 0 }, '&:focus': { outline: 'none' } }}
        >
          {children}
        </Box>
      </Box>
      <NavBar role={user.role} pathname={pathname} moreOpen={moreOpen} onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role={user.role}
        pathname={pathname}
        demoMode={demoMode}
        onSwitchUser={openSwitcher}
        onSignOut={handleSignOut}
      />
      {demoMode ? (
        <DemoUserSwitcher
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          accounts={demoAccounts}
          currentEmail={user.email}
        />
      ) : null}
    </Box>
  );
}
