import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DemoAccount } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { SignInView } from '@/ui/features/auth/SignInView';
import { theme } from '@/ui/theme/theme';

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/sign-in',
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ACCOUNTS: DemoAccount[] = [
  { key: 'author', email: 'author@example.com', name: 'Asha Rao', role: 'author', hint: 'write a post' },
  { key: 'author2', email: 'author2@example.com', name: 'Ben Ortiz', role: 'author', hint: 'report a post' },
  { key: 'moderator', email: 'moderator@example.com', name: 'Chen Wei', role: 'moderator', hint: 'decide' },
  { key: 'senior', email: 'senior@example.com', name: 'Dana Okafor', role: 'senior_moderator', hint: 'appeals' },
  { key: 'senior2', email: 'senior2@example.com', name: 'Elif Demir', role: 'senior_moderator', hint: 'appeals' },
  { key: 'admin', email: 'admin@example.com', name: 'Femi Adeyemi', role: 'admin', hint: 'publish' },
];

function renderView(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function respondWith(status: number, payload: unknown) {
  const fetchMock = vi.fn(async () => Response.json(payload, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  nav.replace.mockReset();
  nav.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe('demo sign-in cards', () => {
  it('[UX-5] show one card per demo account in demo mode', () => {
    renderView(<SignInView demoMode accounts={ACCOUNTS} next={null} />);
    expect(screen.getByRole('heading', { name: 'Demo accounts' })).toBeInTheDocument();
    for (const account of ACCOUNTS) {
      expect(screen.getByRole('button', { name: new RegExp(account.name) })).toHaveTextContent(`Try: ${account.hint}`);
    }
  });

  it('[UX-5] are absent when demo mode is off', () => {
    renderView(<SignInView demoMode={false} accounts={[]} next={null} />);
    expect(screen.queryByRole('heading', { name: 'Demo accounts' })).toBeNull();
  });

  it("[UX-5] one click signs in as that account and opens the role's home page", async () => {
    const ux = userEvent.setup();
    const fetchMock = respondWith(200, {
      data: { user: { id: 'u3', email: 'moderator@example.com', name: 'Chen Wei', role: 'moderator' } },
    });
    renderView(<SignInView demoMode accounts={ACCOUNTS} next={null} />);
    await ux.click(screen.getByRole('button', { name: /Chen Wei/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/queue'));
    expect(nav.refresh).toHaveBeenCalled();
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/auth/demo');
    expect(JSON.parse(String(init.body))).toEqual({ account: 'moderator' });
  });

  it('[UX-5] returns to the page the user asked for (next) after sign-in', async () => {
    const ux = userEvent.setup();
    respondWith(200, { data: { user: { id: 'u6', email: 'admin@example.com', name: 'Femi Adeyemi', role: 'admin' } } });
    renderView(<SignInView demoMode accounts={ACCOUNTS} next="/audit" />);
    await ux.click(screen.getByRole('button', { name: /Femi Adeyemi/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/audit'));
  });
});

describe('email and password form', () => {
  it('[UX-1] validates inline, names each field and focuses the first invalid one, without a request', async () => {
    const ux = userEvent.setup();
    const fetchMock = respondWith(200, {});
    renderView(<SignInView demoMode={false} accounts={[]} next={null} />);
    await ux.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();

    await ux.type(screen.getByLabelText('Email'), 'not-an-email');
    await ux.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter an email address like name@example.com.')).toBeInTheDocument();
  });

  it('[SEC-1] a wrong password shows the server message and keeps what was typed', async () => {
    const ux = userEvent.setup();
    respondWith(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.', requestId: 'r1' },
    });
    renderView(<SignInView demoMode={false} accounts={[]} next={null} />);
    await ux.type(screen.getByLabelText('Email'), 'author@example.com');
    await ux.type(screen.getByLabelText('Password'), 'wrong-password');
    await ux.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Email')).toHaveValue('author@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-password');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('[SEC-4] a rate-limited sign-in shows when to try again', async () => {
    const ux = userEvent.setup();
    respondWith(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in 15 minutes.', requestId: 'r2' },
    });
    renderView(<SignInView demoMode={false} accounts={[]} next={null} />);
    await ux.type(screen.getByLabelText('Email'), 'author@example.com');
    await ux.type(screen.getByLabelText('Password'), 'any-password');
    await ux.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in attempts. Try again in 15 minutes.');
  });

  it('[UX-1] a successful sign-in opens the home page for the role', async () => {
    const ux = userEvent.setup();
    respondWith(200, {
      data: { user: { id: 'u1', email: 'author@example.com', name: 'Asha Rao', role: 'author' } },
    });
    renderView(<SignInView demoMode={false} accounts={[]} next={null} />);
    await ux.type(screen.getByLabelText('Email'), 'author@example.com');
    await ux.type(screen.getByLabelText('Password'), 'right-password');
    await ux.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/feed'));
  });
});
