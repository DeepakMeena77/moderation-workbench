import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import type { PolicyDiff, PolicyValidation } from '@/ui/features/policy/api';
import { DiffView } from '@/ui/features/policy/DiffView';
import { PublishFlow } from '@/ui/features/policy/PublishFlow';
import { theme } from '@/ui/theme/theme';

// DiffView (POL-5) and the publish flow (POL-2): errors with paths, the diff preview and impact, a confirm step,
// and the pasted JSON kept through errors.

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

function respondWith(data: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    Response.json(status === 200 ? { data } : { error: data }, { status, headers: { 'x-request-id': 'req-test-1' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const clause = {
  code: 'SCAM-1',
  title: 'Financial scams',
  text: '<script>alert(1)</script> send crypto',
  defaultSeverity: 'high' as const,
  defaultAction: 'limit' as const,
  allowedActions: ['limit' as const, 'remove' as const],
  signals: {},
  alwaysEscalate: false,
};

const diff: PolicyDiff = {
  added: [clause],
  removed: [],
  changed: [
    {
      code: 'SPAM-1',
      title: 'Spam and link flooding (2+ links)',
      changes: [{ field: 'signals.linkThreshold', before: 3, after: 2 }],
    },
  ],
  unchanged: ['HAR-1'],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DiffView', () => {
  it('[POL-5] shows added and changed clauses with field-level before and after, as plain text', () => {
    renderWithProviders(<DiffView diff={diff} fromLabel="v1" toLabel="v2" />);
    expect(screen.getByText('1 added, 0 removed, 1 changed, 1 unchanged (v1 -> v2).')).toBeInTheDocument();
    const added = screen.getByRole('region', { name: 'Added' });
    expect(within(added).getByText('SCAM-1 - Financial scams')).toBeInTheDocument();
    // SEC-3: markup in a clause is text, never HTML.
    expect(within(added).getByText('<script>alert(1)</script> send crypto')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    const changed = screen.getByRole('region', { name: 'Changed' });
    expect(within(changed).getByText('signals.linkThreshold')).toBeInTheDocument();
    expect(within(changed).getByText('3')).toBeInTheDocument();
    expect(within(changed).getByText('2')).toBeInTheDocument();
  });

  it('[POL-5] an empty diff says there are no differences', () => {
    renderWithProviders(
      <DiffView diff={{ added: [], removed: [], changed: [], unchanged: ['HAR-1'] }} fromLabel="v1" toLabel="v1" />,
    );
    expect(screen.getByText('No clause differences between v1 and v1.')).toBeInTheDocument();
  });
});

describe('PublishFlow', () => {
  it('[POL-2] an empty paste is caught inline and nothing is sent', async () => {
    const fetchMock = respondWith({});
    renderWithProviders(<PublishFlow onPublished={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(screen.getByText('Paste or upload the policy JSON.')).toBeInTheDocument();
    expect(screen.getByLabelText('Policy JSON')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[POL-2] validation errors are listed with their JSON paths and the pasted text is kept', async () => {
    const invalid: PolicyValidation = {
      valid: false,
      errors: [{ path: 'clauses.1.defaultAction', message: 'defaultAction must be one of allowedActions.' }],
      preview: null,
    };
    respondWith(invalid);
    renderWithProviders(<PublishFlow onPublished={vi.fn()} />);
    const field = screen.getByLabelText('Policy JSON');
    fireEvent.change(field, { target: { value: '{"clauses": []}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    const list = await screen.findByRole('list', { name: 'Validation errors' });
    expect(within(list).getByText('clauses.1.defaultAction')).toBeInTheDocument();
    expect(within(list).getByText(/defaultAction must be one of allowedActions/)).toBeInTheDocument();
    expect(field).toHaveValue('{"clauses": []}');
    expect(screen.getByText('Validate', { selector: '[aria-current="step"]' })).toBeInTheDocument();
  });

  it('[POL-2] a valid paste shows the diff and impact, then publishes only after the confirm dialog', async () => {
    const valid: PolicyValidation = {
      valid: true,
      errors: [],
      preview: { fromVersion: 1, nextVersion: 2, diff, sameAsVersion: null, impact: { unresolvedCases: 12 } },
    };
    const fetchMock = respondWith(valid);
    const onPublished = vi.fn();
    renderWithProviders(<PublishFlow onPublished={onPublished} />);
    fireEvent.change(screen.getByLabelText('Policy JSON'), { target: { value: '{"clauses": [1]}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText(/12 unresolved cases will be re-analysed under v2/)).toBeInTheDocument();
    expect(screen.getByText('SCAM-1 - Financial scams')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish v2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish policy v2?' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respondWith({ version: 2, run: { id: 'run-1', total: 12 } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(onPublished).toHaveBeenCalledWith('run-1');
    expect(await screen.findByText('Policy v2 published. Re-evaluating 12 unresolved cases.')).toBeInTheDocument();
  });

  it('[POL-3] clauses identical to an existing version cannot be published (POLICY_UNCHANGED)', async () => {
    respondWith({
      valid: true,
      errors: [],
      preview: { fromVersion: 2, nextVersion: 3, diff, sameAsVersion: 2, impact: { unresolvedCases: 0 } },
    } satisfies PolicyValidation);
    renderWithProviders(<PublishFlow onPublished={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Policy JSON'), { target: { value: '{"clauses": [2]}' } });
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/identical to policy v2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish v3' })).toBeDisabled();
  });
});
