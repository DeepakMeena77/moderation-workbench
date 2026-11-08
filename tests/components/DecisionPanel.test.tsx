import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { DecisionPanel } from '@/ui/features/case/DecisionPanel';
import {
  actionDisabledReason,
  decisionButtonLabel,
  successMessage,
  validateDraft,
} from '@/ui/features/case/decisionForm';
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

describe('decision button labels', () => {
  it('[HUM-2] the primary button says exactly what will happen', () => {
    const base = { recommended: 'limit' as const, contentType: 'post' as const, finalAction: null, clauseCodes: [] };
    expect(decisionButtonLabel(null, base)).toBe('Choose a decision');
    expect(decisionButtonLabel('approve', base)).toBe('Approve: limit this post');
    expect(decisionButtonLabel('approve', { ...base, recommended: 'remove', contentType: 'comment' })).toBe(
      'Approve: remove this comment',
    );
    expect(decisionButtonLabel('reject', base)).toBe('Reject: keep visible');
    expect(decisionButtonLabel('modify', base)).toBe('Modify: choose an action');
    expect(decisionButtonLabel('modify', { ...base, finalAction: 'label', clauseCodes: ['HAR-1'] })).toBe(
      'Modify: label under HAR-1',
    );
  });
});

describe('DecisionPanel', () => {
  it('[HUM-2] shows Approve, Reject and Modify as option cards, each with its consequence', async () => {
    stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Decision' });
    const cards = within(group).getAllByRole('radio');
    expect(cards.map((card) => card.textContent)).toEqual([
      'ApproveTake the recommended action (label)',
      'RejectNo violation; keep it visible',
      'ModifyChoose a different action or clause',
    ]);
    expect(within(group).getByRole('radio', { name: 'Reject' })).toHaveAccessibleDescription(
      'No violation; keep it visible',
    );
    expect(screen.getByRole('button', { name: 'Choose a decision' })).toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: 'Approve' }));
    expect(within(group).getByRole('radio', { name: 'Approve' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Approve: label this post' })).toBeInTheDocument();
    // Approve needs no rationale; Reject and Modify do.
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(within(group).getByRole('radio', { name: 'Reject' }));
    expect(screen.getByRole('button', { name: 'Reject: keep visible' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Note/ })).toBeRequired();

    await user.click(within(group).getByRole('radio', { name: 'Modify' }));
    expect(screen.getByRole('button', { name: 'Modify: choose an action' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Limit' }));
    expect(screen.getByRole('button', { name: 'Modify: limit under HAR-1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Rationale/ })).toBeRequired();
  });

  it('[UX-3] the option cards work from the keyboard: arrows move, Space selects', async () => {
    stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    const approve = screen.getByRole('radio', { name: 'Approve' });
    expect(approve).toHaveAttribute('tabindex', '0');
    approve.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Reject' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: 'Reject' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Modify' })).toHaveFocus();
  });

  it('[HUM-2] submitting without a choice shows an inline error on the cards and focuses them', async () => {
    const fetchMock = stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Choose a decision' }));
    const group = screen.getByRole('radiogroup', { name: 'Decision' });
    expect(group).toHaveAccessibleDescription('Choose approve, reject or modify.');
    expect(screen.getByRole('radio', { name: 'Approve' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[HUM-3] shows inline errors and moves focus to the first invalid field, without calling the API', async () => {
    const fetchMock = stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('radio', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Reject: keep visible' }));
    expect(screen.getByText('Choose a reason.')).toBeInTheDocument();
    expect(screen.getByText('Explain your change in at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'False positive' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[HUM-4] disables actions the chosen clauses do not allow, with the reason', async () => {
    stubFetch(200, { data: {} });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('radio', { name: 'Modify' }));
    // HAR-1 (preselected from the recommendation) allows every action; switch to PII-1 only.
    await user.click(screen.getByRole('checkbox', { name: 'HAR-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'PII-1' }));
    expect(screen.getByRole('radio', { name: 'Label' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: 'Limit' })).not.toHaveAttribute('aria-disabled');
  });

  it('[HUM-6] a stale analysis shows the 409 message with Reload, and keeps the choice and the typed note', async () => {
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
    await user.click(screen.getByRole('radio', { name: 'Reject' }));
    await user.click(screen.getByRole('radio', { name: 'False positive' }));
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'Just banter.');
    await user.click(screen.getByRole('button', { name: 'Reject: keep visible' }));
    expect(await screen.findByText(/re-analysed under policy v2/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Note/ })).toHaveValue('Just banter.');
    expect(screen.getByRole('radio', { name: 'Reject' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('[HUM-2] approve sends the analysis id and announces the outcome', async () => {
    const fetchMock = stubFetch(200, {
      data: { decisionId: 'd1', kind: 'approve', finalAction: 'label', clauseCodes: ['HAR-1'], policyVersion: 1 },
    });
    const user = userEvent.setup();
    renderWithProviders(<DecisionPanel detail={makeDetail()} onReload={() => undefined} />);
    await user.click(screen.getByRole('radio', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Approve: label this post' }));
    expect(await screen.findByText('Decision saved - content labelled under HAR-1.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cases/case1/decisions');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'approve', analysisId: 'a1' });
  });
});
