'use client';

import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { useAfterAuthChange, useDemoSignIn, type DemoAccount } from '../api/hooks';
import { Button } from '../components/Button';
import { useSnackbar } from '../components/SnackbarProvider';
import { layout, m3 } from '../theme/theme';
import { homeFor, ROLE_LABEL } from './navigation';

// "Switch demo user" (UX-5): change role without going back to the sign-in page, so a reviewer can walk the
// whole multi-role journey quickly.
export function DemoUserSwitcher({
  open,
  onClose,
  accounts,
  currentEmail,
}: {
  open: boolean;
  onClose: () => void;
  accounts: readonly DemoAccount[];
  currentEmail: string;
}) {
  const demoSignIn = useDemoSignIn();
  const afterAuthChange = useAfterAuthChange();
  const notify = useSnackbar();

  const choose = (account: DemoAccount) => {
    if (account.email === currentEmail) {
      onClose();
      return;
    }
    demoSignIn.mutate(account.key, {
      onSuccess: ({ user }) => {
        onClose();
        afterAuthChange(homeFor(user.role));
      },
      onError: () => notify("Couldn't switch user. Try again."),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="demo-switcher-title" fullWidth maxWidth="xs">
      <DialogTitle id="demo-switcher-title" sx={(theme) => ({ ...theme.typography.h2 })}>
        Switch demo user
      </DialogTitle>
      <DialogContent sx={{ px: 3 }}>
        <List disablePadding>
          {accounts.map((account) => {
            const current = account.email === currentEmail;
            const pending = demoSignIn.isPending && demoSignIn.variables === account.key;
            return (
              <ListItem key={account.key} disablePadding>
                <ListItemButton
                  onClick={() => choose(account)}
                  disabled={demoSignIn.isPending}
                  aria-current={current ? 'true' : undefined}
                  sx={(theme) => ({
                    borderRadius: `${layout.controlRadius}px`,
                    ...(current ? { backgroundColor: m3(theme).selected, color: m3(theme).onSurface } : {}),
                  })}
                >
                  <ListItemText
                    primary={`${ROLE_LABEL[account.role]} - ${account.name}`}
                    secondary={current ? 'Signed in now' : account.email}
                    slotProps={{ secondary: { sx: { color: 'inherit' } } }}
                  />
                  {pending ? <CircularProgress size={20} aria-label={`Signing in as ${account.name}`} /> : null}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 6 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
