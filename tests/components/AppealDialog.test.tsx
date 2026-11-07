import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyContentItem } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { AppealForm } from '@/ui/features/me/AppealDialog';
import { linkError, linksToSend, toAppealRequest, validateAppeal } from '@/ui/features/me/appealForm';
import { theme } from '@/ui/theme/theme';

// The appeal form (APP-1, APP-2, UX-1): a 20-2,000 character statement, up to 3 http(s) links as chips, an optional
// note; validation before sending, and typed input kept when the server says no.

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

const ITEM: MyContentItem = {
  id: 'content1',
  type: 'post',
  body: 'You are a worthless idiot',
  createdAt: '2026-11-07T09:00:00.000Z',
  visibility: 'limited',
  caseStatus: 'resolved',
  decision: {
    id: 'decision1',
    finalAction: 'limit',
    clauses: [{ code: 'HAR-1', title: 'Harassment and insults' }],
    decidedAt: '2026-11-07T09:30:00.000Z',
    summary: 'A moderator limited this under HAR-1 (Harassment and insults).',
  },
  appeal: null,
  appealability: { canAppeal: true, until: '2026-11-21T09:30:00.000Z', reason: null },
};

const STATEMENT = 'I was quoting a film line the thread was discussing.';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appeal form rules', () => {
  it('[APP-1] the statement needs 20-2,000 characters and links must be full http(s) links, at most 3', () => {
    expect(validateAppeal({ statement: 'too short', links: [], linkInput: '', note: '' })).toEqual({
      statement: 'Explain your appeal in at least 20 characters.',
    });
    expect(validateAppeal({ statement: 'x'.repeat(2001), links: [], linkInput: '', note: '' }).statement).toBe(
      'Keep it under 2,000 characters (2,001).',
    );
    expect(linkError('javascript:alert(1)', [])).toBe('Enter a full link that starts with https:// or http://.');
    expect(linkError('example.com', [])).toBe('Enter a full link that starts with https:// or http://.');
    expect(linkError('https://a.test/1', ['https://a.test/1'])).toBe('You already added this link.');
    expect(linkError('https://a.test/4', ['https://a.test/1', 'https://a.test/2', 'https://a.test/3'])).toBe(
      'Add at most 3 links.',
    );
  });

  it('[APP-1] a valid link still in the field is sent, so nothing typed is dropped', () => {
    const draft = {
      statement: `  ${STATEMENT}  `,
      links: ['https://a.test/1'],
      linkInput: 'https://a.test/2',
      note: ' ',
    };
    expect(linksToSend(draft)).toEqual(['https://a.test/1', 'https://a.test/2']);
    expect(toAppealRequest(draft)).toEqual({
      statement: STATEMENT,
      evidenceLinks: ['https://a.test/1', 'https://a.test/2'],
    });
  });
});

describe('appeal form', () => {
  it('[APP-1] validates inline and focuses the statement, then sends the appeal with its links', async () => {
    const user = userEvent.setup();
    const done = vi.fn();
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: { appealId: 'a1', status: 'pending', assigned: true, deadline: '2026-11-21T09:30:00.000Z' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AppealForm target={{ item: ITEM, decisionId: 'decision1' }} titleId="t" onDone={done} />);

    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(screen.getByText('Explain your appeal in at least 20 characters.')).toBeVisible();
    expect(screen.getByLabelText(/Why should the decision change/)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/Why should the decision change/));
    await user.paste(STATEMENT);
    await user.click(screen.getByLabelText('Link'));
    await user.paste('not a link');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByText('Enter a full link that starts with https:// or http://.')).toBeVisible();
    await user.clear(screen.getByLabelText('Link'));
    await user.paste('https://example.com/scene');
    await user.keyboard('{Enter}');
    expect(screen.getByText('https://example.com/scene')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(await screen.findByText('Appeal sent. A senior moderator will review it.')).toBeVisible();
    expect(done).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/decisions/decision1/appeals');
    expect(JSON.parse(String(init.body))).toEqual({
      statement: STATEMENT,
      evidenceLinks: ['https://example.com/scene'],
    });
  });

  it('[APP-2] a refused appeal keeps what was typed and explains why', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'APPEAL_WINDOW_CLOSED',
              message: 'The appeal window closed on 21 Nov 2026.',
              requestId: 'r1',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const done = vi.fn();
    renderWithProviders(<AppealForm target={{ item: ITEM, decisionId: 'decision1' }} titleId="t" onDone={done} />);
    await user.click(screen.getByLabelText(/Why should the decision change/));
    await user.paste(STATEMENT);
    await user.click(screen.getByRole('button', { name: 'Send appeal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The appeal window closed on 21 Nov 2026.');
    expect(screen.getByLabelText(/Why should the decision change/)).toHaveValue(STATEMENT);
    expect(done).not.toHaveBeenCalled();
  });
});
