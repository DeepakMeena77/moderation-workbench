import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedPost } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { PostCard } from '@/ui/features/feed/PostCard';
import { ReportDialog } from '@/ui/features/feed/ReportDialog';
import { theme } from '@/ui/theme/theme';

// Post cards and the report form (CNT-3, CNT-5, SEC-3).

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

function makePost(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id: 'cpost1',
    type: 'post',
    body: 'A post about the lake',
    createdAt: new Date().toISOString(),
    author: { id: 'u1', name: 'Asha Rao' },
    visibility: 'visible',
    isOwn: false,
    viewerReported: false,
    analysing: false,
    moderation: { clauseCodes: [], appealUntil: null },
    comments: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PostCard', () => {
  it('[SEC-3] renders user text as plain text, never as HTML', () => {
    const { container } = renderWithProviders(
      <PostCard
        post={makePost({ body: '<script>alert(1)</script><b>bold</b>' })}
        canComment={false}
        onReport={vi.fn()}
      />,
    );
    expect(screen.getByText('<script>alert(1)</script><b>bold</b>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('[CNT-5] labeled content shows a warning tag naming the clause', () => {
    renderWithProviders(
      <PostCard
        post={makePost({ visibility: 'labeled', moderation: { clauseCodes: ['HAR-1'], appealUntil: null } })}
        canComment={false}
        onReport={vi.fn()}
      />,
    );
    expect(screen.getByText('Warning: HAR-1')).toBeInTheDocument();
    expect(screen.getByText('A post about the lake')).toBeInTheDocument();
  });

  it('[CNT-5] limited content is collapsed until "Show anyway"', async () => {
    renderWithProviders(
      <PostCard
        post={makePost({ visibility: 'limited', moderation: { clauseCodes: ['SPAM-1'], appealUntil: null } })}
        canComment={false}
        onReport={vi.fn()}
      />,
    );
    expect(screen.queryByText('A post about the lake')).not.toBeInTheDocument();
    expect(screen.getByText('This post has limited reach under SPAM-1.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show anyway' }));
    expect(screen.getByText('A post about the lake')).toBeInTheDocument();
  });

  it('[CNT-5] removed content is shown to its author with the clause and the appeal deadline', () => {
    renderWithProviders(
      <PostCard
        post={makePost({
          visibility: 'removed',
          isOwn: true,
          moderation: { clauseCodes: ['HAR-1'], appealUntil: '2026-11-21T10:00:00.000Z' },
        })}
        canComment
        onReport={vi.fn()}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Removed - under HAR-1, you can appeal until 21 Nov.');
  });

  it('[CNT-5] the author sees "Analysing..." while the checks run', () => {
    renderWithProviders(<PostCard post={makePost({ isOwn: true, analysing: true })} canComment onReport={vi.fn()} />);
    expect(screen.getByText('Analysing...')).toBeInTheDocument();
  });

  it('[CNT-3] own content has no Report button; reported content shows "Reported"', () => {
    const { unmount } = renderWithProviders(
      <PostCard post={makePost({ isOwn: true })} canComment onReport={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<PostCard post={makePost({ viewerReported: true })} canComment onReport={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reported' })).toBeDisabled();
  });

  it('[CNT-2] comments open inline with a comment composer for authors', async () => {
    const post = makePost({
      comments: [
        { ...makePost({ id: 'c1', type: 'comment', body: 'Nice one', author: { id: 'u2', name: 'Ben Ortiz' } }) },
      ],
    });
    renderWithProviders(<PostCard post={post} canComment onReport={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Comments (1)' }));
    const comment = screen.getByRole('region', { name: 'Comment by Ben Ortiz' });
    expect(within(comment).getByText('Nice one')).toBeInTheDocument();
    expect(screen.getByLabelText('Write a comment')).toBeInTheDocument();
  });
});

describe('ReportDialog', () => {
  it('[CNT-3] requires a reason, then sends the reason and the note', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { reported: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    renderWithProviders(
      <ReportDialog target={{ id: 'cpost1', type: 'post', authorName: 'Asha Rao' }} onClose={onClose} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Report this post' });
    expect(within(dialog).getByText('Asha Rao will not see who reported it.')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));
    expect(within(dialog).getByText('Choose a reason.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Spam' }));
    expect(within(dialog).getByRole('radio', { name: 'Spam' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'Same link five times');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/content/cpost1/reports', expect.objectContaining({ method: 'POST' }));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'spam', note: 'Same link five times' });
    expect(await screen.findByText('Report sent. A moderator will review it.')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('[CNT-3] a failed report keeps the choices and shows the error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId: 'r1' },
          }),
          {
            status: 500,
          },
        ),
      ),
    );
    renderWithProviders(
      <ReportDialog target={{ id: 'cpost1', type: 'post', authorName: 'Asha Rao' }} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Hate' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    expect(within(dialog).getByRole('radio', { name: 'Hate' })).toHaveAttribute('aria-checked', 'true');
  });
});
