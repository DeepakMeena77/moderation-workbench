import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/ui/api/client';
import { QueryState, type QueryLike } from '@/ui/components/QueryState';
import { theme } from '@/ui/theme/theme';

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

function query(overrides: Partial<QueryLike<string[]>>): QueryLike<string[]> {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

const list = (items: string[]) => (
  <ul>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

describe('QueryState', () => {
  it('[UX-1] shows a skeleton in a busy live region while loading', () => {
    renderThemed(
      <QueryState query={query({ isLoading: true })} loadingLabel="Loading cases">
        {list}
      </QueryState>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading cases');
  });

  it('[UX-1] shows the error message, the request ID and a Retry button that refetches', async () => {
    const ux = userEvent.setup();
    const refetch = vi.fn();
    const error = new ApiError(500, 'INTERNAL', 'Something went wrong on our side.', 'req-123');
    renderThemed(<QueryState query={query({ isError: true, error, refetch })}>{list}</QueryState>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    expect(screen.getByText('Request ID: req-123')).toBeInTheDocument();
    await ux.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('[UX-1] offers Reload instead of Retry on a 409 conflict', () => {
    const error = new ApiError(409, 'STALE_ANALYSIS', 'This case changed while you were reviewing it.', 'req-9');
    renderThemed(<QueryState query={query({ isError: true, error })}>{list}</QueryState>);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('[UX-1] shows the empty state when there is nothing to list', () => {
    renderThemed(
      <QueryState query={query({ data: [] })} isEmpty={(data) => data.length === 0}>
        {list}
      </QueryState>,
    );
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('[UX-1] renders the children with the data', () => {
    renderThemed(<QueryState query={query({ data: ['first', 'second'] })}>{list}</QueryState>);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['first', 'second']);
  });
});
