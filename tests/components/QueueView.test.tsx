import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queueSearch, type CaseListPage, type CaseRow } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { QueueView, rowSupportingText } from '@/ui/features/queue/QueueView';
import { parseQueueFilters } from '@/ui/features/queue/queueFilters';
import { firstReason, QueueTable } from '@/ui/features/queue/QueueTable';
import { theme } from '@/ui/theme/theme';

// The queue (Q-1, Q-3, UX-3): URL filters, the empty / error states, row text and the wide-screen table.

const nav = vi.hoisted(() => ({ search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/queue',
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}));

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function stubList(status: number, payload: unknown) {
  const fetchMock = vi.fn(async () => Response.json(payload, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ROW: CaseRow = {
  id: 'case1',
  status: 'awaiting_review',
  trigger: 'new_content',
  entry: 'rules',
  priority: 85,
  reportCount: 2,
  createdAt: new Date().toISOString(),
  content: { id: 'c1', type: 'post', excerpt: 'You are a worthless idiot', authorName: 'Alex' },
  analysis: {
    seq: 1,
    policyVersion: 1,
    aiStatus: 'unavailable',
    action: 'label',
    severity: 'high',
    confidence: null,
    clauseCodes: ['HAR-1', 'PII-1'],
    // Most specific first, as the server ranks them (moderation/reasonOrder.ts).
    reasons: ['Reported by 2 users.', 'AI result missing: rule findings only.'],
  },
};

beforeEach(() => {
  nav.search = '';
  nav.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queue filters', () => {
  it('[Q-1] filters round-trip through the URL and invalid values are dropped', () => {
    const filters = parseQueueFilters(
      new URLSearchParams('status=auto_cleared&severity=high&trigger=report&policy=2&ai=unavailable&q=HAR-1'),
    );
    expect(filters).toEqual({
      status: 'auto_cleared',
      severity: 'high',
      trigger: 'report',
      policy: 2,
      ai: 'unavailable',
      q: 'HAR-1',
    });
    expect(parseQueueFilters(new URLSearchParams(queueSearch(filters)))).toEqual(filters);
    expect(parseQueueFilters(new URLSearchParams('status=resolved&severity=extreme&policy=-1'))).toEqual({
      status: 'awaiting_review',
    });
    expect(queueSearch({ status: 'awaiting_review' })).toBe('');
  });

  it('[Q-1] a row reads "High, Post, Alex, HAR-1, PII-1, 2 reports"', () => {
    expect(rowSupportingText(ROW)).toBe('High, Post, Alex, HAR-1, PII-1, 2 reports');
  });
});

describe('QueueView', () => {
  it('[Q-3] an empty queue says "Queue is clear."', async () => {
    stubList(200, { data: { items: [], total: 0, nextCursor: null } satisfies CaseListPage });
    renderWithProviders(<QueueView selectedId={null} />);
    expect(await screen.findByText('Queue is clear.')).toBeInTheDocument();
    expect(screen.getByText('New posts and reports will appear here.')).toBeInTheDocument();
  });

  it('[Q-3] an empty search offers Clear filters, which keeps only the status', async () => {
    nav.search = 'status=pending_analysis&q=HAR-9';
    stubList(200, { data: { items: [], total: 0, nextCursor: null } });
    const user = userEvent.setup();
    renderWithProviders(<QueueView selectedId={null} />);
    expect(await screen.findByText("No cases match 'HAR-9'.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(nav.replace).toHaveBeenCalledWith('/queue?status=pending_analysis', { scroll: false });
  });

  it('[Q-3] a failed load shows the error with Retry', async () => {
    stubList(500, { error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId: 'r1' } });
    renderWithProviders(<QueueView selectedId={null} />);
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('[Q-1] rows link to the case with the filters kept, and a filter chip updates the URL', async () => {
    nav.search = 'severity=high';
    const fetchMock = stubList(200, { data: { items: [ROW], total: 1, nextCursor: null } });
    const user = userEvent.setup();
    renderWithProviders(<QueueView selectedId={null} />);
    // The list (below 1200 px) and the table (from 1200 px) are both rendered; CSS shows one of them.
    const links = await screen.findAllByRole('link', { name: /You are a worthless idiot/ });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/queue/case1?severity=high');
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/cases?severity=high', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Reported' }));
    expect(nav.replace).toHaveBeenCalledWith('/queue?severity=high&trigger=report', { scroll: false });
  });
});

describe('QueueTable', () => {
  it('[Q-1] from 1200 px the queue is a table with the columns a moderator weighs before opening a case', () => {
    renderWithProviders(<QueueTable rows={[ROW]} search="?severity=high" />);
    const table = screen.getByRole('table', { name: 'Cases, highest priority first' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Priority',
      'Content',
      'Source',
      'Proposed action',
      'Severity',
      'Confidence',
      'Why a human',
      'Policy',
      'Age',
    ]);
    const [, row] = within(table).getAllByRole('row');
    const cells = within(row as HTMLElement)
      .getAllByRole('cell')
      .map((td) => td.textContent);
    expect(cells.slice(0, 8)).toEqual([
      '85',
      'You are a worthless idiotPost2 reports',
      'Rules',
      'Label',
      'High',
      '-',
      'Reported by 2 users.1 more',
      'v1',
    ]);
    expect(within(table).getByRole('link', { name: 'You are a worthless idiot' })).toHaveAttribute(
      'href',
      '/queue/case1?severity=high',
    );
  });

  it('[UX-3] a row is focusable; Enter or a click opens the case with the filters kept', async () => {
    nav.push.mockReset();
    const user = userEvent.setup();
    renderWithProviders(<QueueTable rows={[ROW]} search="?severity=high" />);
    const [, row] = screen.getAllByRole('row');
    expect(row).toHaveAttribute('tabindex', '0');
    (row as HTMLElement).focus();
    await user.keyboard('{Enter}');
    expect(nav.push).toHaveBeenCalledWith('/queue/case1?severity=high', { scroll: false });
    nav.push.mockReset();
    await user.click(screen.getByText('Rules'));
    expect(nav.push).toHaveBeenCalledWith('/queue/case1?severity=high', { scroll: false });
  });

  it('[Q-1] the first reason a human must decide, and how many more', () => {
    expect(firstReason([])).toBeNull();
    expect(firstReason(['One.'])).toEqual({ text: 'One.', more: null });
    expect(firstReason(['One.', 'Two.', 'Three.'])).toEqual({ text: 'One.', more: '2 more' });
  });
});
