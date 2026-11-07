import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queueSearch, type CaseListPage, type CaseRow } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { QueueView, rowSupportingText } from '@/ui/features/queue/QueueView';
import { parseQueueFilters } from '@/ui/features/queue/queueFilters';
import { theme } from '@/ui/theme/theme';

// The queue (Q-1, Q-3): URL filters, the empty / error states and row text.

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
    clauseCodes: ['HAR-1', 'PII-1'],
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
    const link = await screen.findByRole('link', { name: /You are a worthless idiot/ });
    expect(link).toHaveAttribute('href', '/queue/case1?severity=high');
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/cases?severity=high', expect.anything());
    await user.click(screen.getByRole('button', { name: 'Reported' }));
    expect(nav.replace).toHaveBeenCalledWith('/queue?severity=high&trigger=report', { scroll: false });
  });
});
