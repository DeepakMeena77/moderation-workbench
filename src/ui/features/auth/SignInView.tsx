'use client';

import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useAfterAuthChange, useDemoSignIn, useSignIn, type DemoAccount, type Role } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { homeFor, ROLE_LABEL } from '../../shell/navigation';
import { layer, layout, m3 } from '../../theme/theme';

// Sign-in page (03 sec. 6.1): email and password for any seeded account, and in demo mode one-click cards per
// role (UX-5). Typed input is kept on every error (03 sec. 7).

const ROLE_ICON: Record<Role, SvgIconComponent> = {
  author: EditNoteRounded,
  moderator: GavelRounded,
  senior_moderator: VerifiedUserRounded,
  admin: AdminPanelSettingsRounded,
};

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (email.trim() === '') errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter an email address like name@example.com.';
  if (password === '') errors.password = 'Enter your password.';
  return errors;
}

function serverFieldErrors(error: ApiError): FieldErrors {
  const errors: FieldErrors = {};
  if (!Array.isArray(error.details)) return errors;
  for (const issue of error.details as Array<{ path?: unknown }>) {
    if (issue.path === 'email') errors.email = 'Enter an email address like name@example.com.';
    if (issue.path === 'password') errors.password = 'Enter your password.';
  }
  return errors;
}

export interface SignInViewProps {
  demoMode: boolean;
  accounts: readonly DemoAccount[];
  /** A safe same-site path to open after sign-in, from ?next=. */
  next: string | null;
}

export function SignInView({ demoMode, accounts, next }: SignInViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const signIn = useSignIn();
  const demoSignIn = useDemoSignIn();
  const afterAuthChange = useAfterAuthChange();
  const busy = signIn.isPending || demoSignIn.isPending;

  const focusFirst = (errors: FieldErrors) => {
    if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
  };

  const showError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 400) {
      const errors = serverFieldErrors(error);
      setFieldErrors(errors);
      focusFirst(errors);
      if (Object.keys(errors).length > 0) return;
    }
    setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const errors = validate(email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirst(errors);
      return;
    }
    signIn.mutate(
      { email: email.trim(), password },
      { onSuccess: ({ user }) => afterAuthChange(next ?? homeFor(user.role)), onError: showError },
    );
  };

  const signInAs = (account: DemoAccount) => {
    setFormError(null);
    demoSignIn.mutate(account.key, {
      onSuccess: ({ user }) => afterAuthChange(next ?? homeFor(user.role)),
      onError: showError,
    });
  };

  return (
    <Box
      component="main"
      id="content"
      sx={{
        minHeight: '100dvh',
        px: { xs: 4, sm: 6 },
        py: { xs: 6, sm: 10 },
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="overline" component="p" color="text.secondary">
            Moderation Workbench
          </Typography>
          <Typography variant="h1">Sign in</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            The AI recommends; humans decide.
          </Typography>
        </Box>

        <Card component="section" aria-label="Sign in with email" sx={{ width: '100%', maxWidth: 440 }}>
          <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {formError ? (
              <Box
                role="alert"
                data-ui="section"
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 3,
                  px: 4,
                  py: 3,
                  borderRadius: `${layout.controlRadius}px`,
                  border: `1px solid ${m3(theme).errorBorder}`,
                  backgroundColor: m3(theme).errorContainer,
                  color: m3(theme).onErrorContainer,
                })}
              >
                <ErrorOutlineRounded aria-hidden />
                <Typography variant="body2">{formError}</Typography>
              </Box>
            ) : null}
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email ?? ' '}
              inputRef={emailRef}
              disabled={busy}
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password ?? ' '}
              inputRef={passwordRef}
              disabled={busy}
              fullWidth
            />
            <Button type="submit" loading={signIn.isPending} disabled={busy} fullWidth>
              Sign in
            </Button>
          </Box>
        </Card>

        {demoMode ? (
          <Card component="section" aria-labelledby="demo-accounts-title" sx={{ width: '100%' }}>
            <Typography id="demo-accounts-title" variant="h3" component="h2">
              Demo accounts
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
              One click signs you in. These are test accounts only.
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              }}
            >
              {accounts.map((account) => {
                const Icon = ROLE_ICON[account.role];
                const pending = demoSignIn.isPending && demoSignIn.variables === account.key;
                return (
                  <ButtonBase
                    key={account.key}
                    data-ui="section"
                    data-demo-account={account.key}
                    onClick={() => signInAs(account)}
                    disabled={busy}
                    sx={(theme) => ({
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      gap: 1,
                      p: 3,
                      borderRadius: `${layout.controlRadius}px`,
                      border: `1px solid ${m3(theme).border}`,
                      backgroundColor: m3(theme).card,
                      color: m3(theme).onSurface,
                      '&:hover': {
                        backgroundColor: layer(m3(theme).onSurface, m3(theme).card, 4),
                        borderColor: m3(theme).borderStrong,
                      },
                    })}
                  >
                    <Box
                      sx={(theme) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        color: m3(theme).onSurfaceVariant,
                        '& svg': { fontSize: 18 },
                      })}
                    >
                      {pending ? (
                        <CircularProgress size={16} aria-label={`Signing in as ${account.name}`} />
                      ) : (
                        <Icon aria-hidden />
                      )}
                      <Typography variant="h4" component="span" sx={(theme) => ({ color: m3(theme).onSurface })}>
                        {ROLE_LABEL[account.role]}
                      </Typography>
                    </Box>
                    <Typography variant="body2" component="span">
                      {account.name}
                    </Typography>
                    <Typography variant="caption" component="span" color="text.secondary">
                      {account.email}
                    </Typography>
                    <Typography variant="caption" component="span" color="text.secondary">
                      Try: {account.hint}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          </Card>
        ) : null}

        <Link component={NextLink} href="/status" variant="body2">
          System status
        </Link>
      </Box>
    </Box>
  );
}
