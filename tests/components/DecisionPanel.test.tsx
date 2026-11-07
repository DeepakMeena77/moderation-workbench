import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { DecisionPanel } from '@/ui/features/case/DecisionPanel';
import { actionDisabledReason, successMessage, validateDraft } from '@/ui/features/case/decisionForm';
import { theme } from '@/ui/theme/theme';
import { CLAUSES, makeDetail } from './helpers/caseDetail';

// The decision form (HUM-2..4, HUM-6, UX-1): validation before submit, progress, kept input on failure.

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

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn(async () => Response.json(payload, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decision form rules', () => {
  it('[HUM-3] reject needs a reason and a note of at least 10 characters', () => {
    const errors = validateDraft(
      { mode: 'reject', finalAction: null, clauseCodes: [], reasonCategory: null, rationale: 'short' },
      CLAUSES,
    );
    expect(errors).toEqual({
      reasonCategory: 'Choose a reason.',
      rationale: 'Explain your change in at least 10 characters.',
    });
  });

  it('[HUM-4] modify needs clauses and an action one of them allows', () => {
    expect(
      validateDraft(
        { mode: 'modify', finalAction: null, clauseCodes: [], reasonCategory: 'other', rationale: 'long enough text' },
        CLAUSES,
      ),
    ).toEqual({ clauseCodes: 'Choose at least one clause.', finalAction: 'Choose an action.' });
    expect(actionDisabledReason('label', CLAUSES, ['PII-1'])).toBe('None of PII-1 allows label.');
    expect(actionDisabledReason('label', CLAUSES, ['PII-1', 'HAR-1'])).toBeNull();
    expect(actionDisabledReason('limit', CLAUSES, [])).toBe('Choose a clause first.');
  });

  it('[HUM-2] the success message names the outcome and the clauses', () => {
    expect(successMessage({ finalAction: 'label', clauseCodes: ['HAR-1'] })).toBe(
      'Decision saved - content labelled under HAR-1.',
    );
    expect(successMessage({ finalAction: 'none', clauseCodes: [] })).toBe(
      'Decision saved - no action, the content stays visible.',
    );
  });
});

describe('DecisionPanel', () => {
  it('[HUM-3] shows inline errors and moves focus to the first invalid field, without calling the API', async () => {
    const fetchMock = stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
    const form = screen.getByRole('form', { name: 'Reject the recommendation' });
    await user.click(within(form).getByRole('button', { name: 'Reject recommendation' }));
    expect(screen.getByText('Choose a reason.')).toBeInTheDocument();
    expect(screen.getByText('Explain your change in at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'False positive' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[HUM-4] disables actions the chosen clauses do not allow, with the reason', async () => {
    stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Modify' }));
    // HAR-1 (preselected from the recommendation) allows every action; switch to PII-1 only.
    await user.click(screen.getByRole('checkbox', { name: 'HAR-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'PII-1' }));
    expect(screen.getByRole('radio', { name: 'Label' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: 'Limit' })).not.toHaveAttribute('aria-disabled');
  });

  it('[HUM-6] a stale analysis shows the 409 message with Reload, and keeps the typed note', async () => {
    stubFetch(409, {
      error: {
        code: 'STALE_ANALYSIS',
        message:
          'This case changed while you were reviewing it (re-analysed under policy v2). Reload to decide on the latest analysis.',
        requestId: 'req-1',
      },
    });
    const onReload = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={onReload} />);
    await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
    await user.click(screen.getByRole('radio', { name: 'False positive' }));
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'Just banter.');
    const form = screen.getByRole('form', { name: 'Reject the recommendation' });
    await user.click(within(form).getByRole('button', { name: 'Reject recommendation' }));
    expect(await screen.findByText(/re-analysed under policy v2/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('Just banter.');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('[HUM-2] approve sends the analysis id and announces the outcome', async () => {
    const fetchMock = stubFetch(200, {
      data: { decisionId: 'd1', kind: 'approve', finalAction: 'label', clauseCodes: ['HAR-1'], policyVersion: 1 },
    });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Approve recommendation (label)' }));
    expect(await screen.findByText('Decision saved - content labelled under HAR-1.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cases/case1/decisions');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'approve', analysisId: 'a1' });
  });
});
