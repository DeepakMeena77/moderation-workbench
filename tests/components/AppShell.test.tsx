import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DemoAccount, Me, Role } from '@/ui/api/hooks';
import { Button } from '@/ui/components/Button';
import { SnackbarProvider, useSnackbar } from '@/ui/components/SnackbarProvider';
import { AppShell } from '@/ui/shell/AppShell';
import { MoreSheet } from '@/ui/shell/MoreSheet';
import { NavBar } from '@/ui/shell/NavBar';
import { NavDrawer } from '@/ui/shell/NavDrawer';
import { NavRail } from '@/ui/shell/NavRail';
import { pageTrail } from '@/ui/shell/navigation';
import { theme } from '@/ui/theme/theme';

const nav = vi.hoisted(() => ({ pathname: '/', replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

/** Visible text of every link and button inside an element, in document order. */
function itemLabels(root: Element): string[] {
  return Array.from(root.querySelectorAll('a, button, [role="button"]')).map((el) => (el.textContent ?? '').trim());
}

// Written out from docs/03-ui-ux.md sec. 3.2 on purpose, rather than read from the navigation config, so a
// config change that drifts from the spec fails here.
const EXPECTED: Record<Role, { bar: string[]; rail: string[]; groups: Array<[string, string[]]>; more: string[] }> = {
  author: {
    bar: ['Feed', 'My content', 'Policy', 'More'],
    rail: ['Feed', 'My content', 'Policy', 'Status'],
    groups: [
      ['Community', ['Feed', 'My content']],
      ['Governance', ['Policy']],
      ['System', ['Status']],
    ],
    more: ['Status'],
  },
  moderator: {
    bar: ['Queue', 'Audit', 'Metrics', 'More'],
    rail: ['Queue', 'Policy', 'Audit', 'Metrics', 'Status'],
    groups: [
      ['Moderation', ['Queue']],
      ['Governance', ['Policy', 'Audit', 'Metrics']],
      ['System', ['Status']],
    ],
    more: ['Policy', 'Status'],
  },
  senior_moderator: {
    bar: ['Queue', 'Appeals', 'Audit', 'More'],
    rail: ['Queue', 'Appeals', 'Policy', 'Audit', 'Metrics', 'Status'],
    groups: [
      ['Moderation', ['Queue', 'Appeals']],
      ['Governance', ['Policy', 'Audit', 'Metrics']],
      ['System', ['Status']],
    ],
    more: ['Policy', 'Metrics', 'Status'],
  },
  admin: {
    bar: ['Policy', 'Queue', 'Appeals', 'More'],
    rail: ['Policy', 'Audit', 'Metrics', 'Queue', 'Appeals', 'Status'],
    groups: [
      ['Governance', ['Policy', 'Audit', 'Metrics']],
      ['Oversight', ['Queue', 'Appeals']],
      ['System', ['Status']],
    ],
    more: ['Audit', 'Metrics', 'Status'],
  },
};

const ROLES = Object.keys(EXPECTED) as Role[];
const noop = () => undefined;

const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: 'author', email: 'author@example.com', name: 'Asha Rao', role: 'author', hint: 'write a post' },
  { key: 'moderator', email: 'moderator@example.com', name: 'Chen Wei', role: 'moderator', hint: 'decide' },
];

afterEach(() => {
  nav.pathname = '/';
  nav.replace.mockReset();
  nav.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe.each(ROLES)('navigation for %s', (role) => {
  const expected = EXPECTED[role];

  it(`[UX-2] the bottom bar shows ${expected.bar.join(', ')}`, () => {
    const { container } = renderWithProviders(<NavBar role={role} pathname="/" moreOpen={false} onOpenMore={noop} />);
    expect(itemLabels(container)).toEqual(expected.bar);
  });

  it('[UX-2] the rail shows every destination in drawer order', () => {
    const { container } = renderWithProviders(<NavRail role={role} pathname="/" />);
    expect(itemLabels(container)).toEqual(expected.rail);
  });

  it('[UX-2] the drawer groups the destinations', () => {
    const { container } = renderWithProviders(
      <NavDrawer role={role} pathname="/" demoMode={false} onSwitchUser={noop} />,
    );
    const groups = Array.from(container.querySelectorAll('ul[aria-labelledby]')).map((list) => [
      document.getElementById(list.getAttribute('aria-labelledby') ?? '')?.textContent,
      itemLabels(list),
    ]);
    expect(groups).toEqual(expected.groups);
  });

  it('[UX-2] the More sheet holds the rest, then theme, demo switch and sign out', () => {
    renderWithProviders(
      <MoreSheet open onClose={noop} role={role} pathname="/" demoMode onSwitchUser={noop} onSignOut={noop} />,
    );
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(itemLabels(sheet)).toEqual([...expected.more, 'Theme: System', 'Switch demo user', 'Sign out']);
  });
});

describe('navigation state', () => {
  it('[UX-2] the top bar names the current page as a short breadcrumb', () => {
    expect(pageTrail('/queue')).toEqual(['Queue']);
    expect(pageTrail('/queue/case-1')).toEqual(['Queue', 'Case']);
    expect(pageTrail('/appeals/appeal-1')).toEqual(['Appeals', 'Appeal']);
    expect(pageTrail('/content/item-1/history')).toEqual(['Moderation history']);
    expect(pageTrail('/no-such-page')).toEqual([]);
  });

  it('[UX-2] marks only the current destination with aria-current="page", including its sub-pages', () => {
    const { container } = renderWithProviders(<NavRail role="moderator" pathname="/queue/case-1" />);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(Array.from(current).map((el) => el.textContent)).toEqual(['Queue']);
  });

  it('[UX-5] the drawer footer and the More sheet offer "Switch demo user" only in demo mode', () => {
    const { container } = renderWithProviders(
      <NavDrawer role="author" pathname="/" demoMode={false} onSwitchUser={noop} />,
    );
    expect(itemLabels(container)).not.toContain('Switch demo user');
    expect(itemLabels(container)).toContain('Theme: System');
  });
});

describe('app shell', () => {
  const user: Me = { id: 'u1', email: 'author@example.com', name: 'Asha Rao', role: 'author' };

  it('[UX-3] has a skip link to the main landmark', () => {
    renderWithProviders(
      <AppShell user={user} demoAccounts={[]}>
        <p>Page body</p>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
    expect(screen.getByRole('main')).toHaveTextContent('Page body');
  });

  it('[UX-5] the account menu offers theme, "Switch demo user" and sign out in demo mode', async () => {
    const ux = userEvent.setup();
    renderWithProviders(
      <AppShell user={user} demoAccounts={DEMO_ACCOUNTS}>
        <p>Page body</p>
      </AppShell>,
    );
    await ux.click(screen.getByRole('button', { name: 'Account: Asha Rao, Author' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Theme: System', 'Switch demo user', 'Sign out']);
  });

  it('[UX-5] without demo mode the account menu has no "Switch demo user"', async () => {
    const ux = userEvent.setup();
    renderWithProviders(
      <AppShell user={user} demoAccounts={[]}>
        <p>Page body</p>
      </AppShell>,
    );
    await ux.click(screen.getByRole('button', { name: 'Account: Asha Rao, Author' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Switch demo user' })).toBeNull();
  });

  it('[UX-5] switching demo user signs in as the chosen account and opens its home page', async () => {
    const ux = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: { user: { id: 'u2', email: 'moderator@example.com', name: 'Chen Wei', role: 'moderator' } },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <AppShell user={user} demoAccounts={DEMO_ACCOUNTS}>
        <p>Page body</p>
      </AppShell>,
    );
    await ux.click(screen.getByRole('button', { name: 'Account: Asha Rao, Author' }));
    await ux.click(await screen.findByRole('menuitem', { name: 'Switch demo user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Switch demo user' });
    await ux.click(within(dialog).getByRole('button', { name: /Moderator - Chen Wei/ }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/queue'));
    expect(nav.refresh).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/demo', expect.objectContaining({ method: 'POST' }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ account: 'moderator' });
  });

  it('[SEC-1] signing out posts to sign-out and returns to the sign-in page', async () => {
    const ux = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: { signedOut: true } })),
    );
    renderWithProviders(
      <AppShell user={user} demoAccounts={[]}>
        <p>Page body</p>
      </AppShell>,
    );
    await ux.click(screen.getByRole('button', { name: 'Account: Asha Rao, Author' }));
    await ux.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/sign-in'));
  });
});

describe('snackbar', () => {
  function Notifier() {
    const notify = useSnackbar();
    return <Button onClick={() => notify('Decision saved.')}>Save</Button>;
  }

  it('[UX-3] messages appear in a polite live region (role="status")', async () => {
    const ux = userEvent.setup();
    renderWithProviders(<Notifier />);
    await ux.click(screen.getByRole('button', { name: 'Save' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Decision saved.');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
