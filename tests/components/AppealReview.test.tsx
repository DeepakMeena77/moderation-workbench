import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppealDetail } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { AppealBody, BLOCKED_MESSAGE } from '@/ui/features/appeals/AppealReview';
import { modifyActionReason, resolveSuccessMessage, validateResolve } from '@/ui/features/appeals/resolveForm';
import { theme } from '@/ui/theme/theme';
import { CLAUSES } from './helpers/caseDetail';

// The appeal review page (APP-3, APP-4, APP-5, AI-12): three panels, the AI summary that never recommends an
// outcome, the resolve form, and the original decider's blocked state.

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

function makeAppeal(overrides: Partial<AppealDetail> = {}): AppealDetail {
  return {
    id: 'appeal1',
    status: 'pending',
    createdAt: '2026-11-07T10:00:00.000Z',
    caseId: 'case1',
    caseStatus: 'appealed',
    content: {
      id: 'content1',
      type: 'post',
      body: 'You are a worthless idiot <script>alert(1)</script>',
      createdAt: '2026-11-07T09:00:00.000Z',
      visibility: 'limited',
      author: { id: 'author1', name: 'Asha Rao' },
    },
    original: {
      decisionId: 'decision1',
      kind: 'modify',
      finalAction: 'limit',
      recommendedAction: 'label',
      clauseCodes: ['HAR-1'],
      reasonCategory: 'severity_too_low',
      rationale: 'Second insult this week.',
      decider: { id: 'senior1', name: 'Dana Okafor' },
      policyVersion: 1,
      analysisSeq: 1,
      createdAt: '2026-11-07T09:30:00.000Z',
      findings: [
        {
          source: 'rule',
          ruleId: 'keyword',
          clauseCode: 'HAR-1',
          evidenceType: 'confirmed',
          quotes: [{ text: 'worthless idiot', start: 10, end: 25 }],
          interpretation: null,
          severity: 'medium',
          severityReason: null,
          confidence: 1,
          confidenceReason: null,
        },
      ],
    },
    evidence: {
      statement: 'I was quoting a film line the thread was discussing.',
      links: ['https://example.com/scene'],
      note: null,
    },
    brief: {
      state: 'ready',
      summary: 'The author says the words quote a film.',
      newPoints: ['Says the words quote a film line.'],
      disputedFindings: [{ clauseCode: 'HAR-1', authorClaim: 'The phrase was quoted, not aimed at anyone.' }],
      droppedClauses: [],
      model: 'mock-model',
      costUsd: 0.0001,
    },
    outcome: null,
    assignedReviewer: { id: 'senior2', name: 'Elif Demir' },
    policyChangedSinceDecision: false,
    activePolicyVersion: 1,
    newerAnalysis: null,
    clauses: CLAUSES,
    permissions: { canResolve: true, isOriginalDecider: false, readOnly: false },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appeal review', () => {
  it('[APP-4] shows the original decision, the appeal evidence and the outcome as three panels', () => {
    renderWithProviders(<AppealBody detail={makeAppeal()} onReload={() => undefined} />);
    const original = screen.getByRole('region', { name: 'Original decision' });
    expect(within(original).getByText('Limit')).toBeInTheDocument();
    expect(within(original).getByText('HAR-1')).toBeInTheDocument();
    expect(within(original).getByText('Policy v1')).toBeInTheDocument();
    expect(within(original).getByText('Second insult this week.')).toBeInTheDocument();
    // The evidence highlight, and markup in the content shown as text (SEC-3).
    expect(within(original).getByText('worthless idiot').tagName).toBe('MARK');
    expect(within(original).getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();

    const evidence = screen.getByRole('region', { name: 'Appeal evidence' });
    expect(within(evidence).getByText(/quoting a film line/)).toBeInTheDocument();
    const link = within(evidence).getByRole('link', { name: 'https://example.com/scene' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');

    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(within(outcome).getByText('Pending')).toBeInTheDocument();
    expect(within(outcome).getByRole('form', { name: 'Resolve the appeal' })).toBeInTheDocument();
  });

  it('[AI-12] the AI summary says it does not recommend an outcome, and shows new points and disputed findings', () => {
    renderWithProviders(<AppealBody detail={makeAppeal()} onReload={() => undefined} />);
    const brief = screen.getByRole('group', { name: 'AI summary' });
    expect(within(brief).getByText(/Does not recommend an outcome/)).toBeInTheDocument();
    expect(within(brief).getByText('Says the words quote a film line.')).toBeInTheDocument();
    expect(within(brief).getByText('The phrase was quoted, not aimed at anyone.')).toBeInTheDocument();
  });

  it('[AI-12] a missing summary is explained and the review can go on without it', () => {
    renderWithProviders(
      <AppealBody
        detail={makeAppeal({ brief: { state: 'unavailable', reason: 'AI quota reached - retry later' } })}
        onReload={() => undefined}
      />,
    );
    expect(
      screen.getByText(/AI quota reached - retry later. Review the appeal from the evidence above./),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resolve appeal' })).toBeEnabled();
  });

  it('[APP-3] the original decider sees the blocked message with every control disabled', () => {
    renderWithProviders(
      <AppealBody
        detail={makeAppeal({ permissions: { canResolve: false, isOriginalDecider: true, readOnly: false } })}
        onReload={() => undefined}
      />,
    );
    expect(screen.getByText(BLOCKED_MESSAGE)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resolve appeal' })).toBeDisabled();
    expect(screen.getByLabelText(/Rationale/)).toBeDisabled();
    for (const name of ['Uphold', 'Overturn', 'Modify']) {
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('[AI-12] the "policy changed since decision" banner shows when the server says so', () => {
    renderWithProviders(
      <AppealBody
        detail={makeAppeal({ policyChangedSinceDecision: true, activePolicyVersion: 2 })}
        onReload={() => undefined}
      />,
    );
    expect(screen.getByText('Policy changed since decision')).toBeVisible();
  });

  it('[APP-5] resolving validates first, then sends the outcome and shows the result', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: {
          appealId: 'appeal1',
          outcome: 'overturn',
          originalAction: 'limit',
          finalAction: 'none',
          visibility: 'visible',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AppealBody detail={makeAppeal()} onReload={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Resolve appeal' }));
    expect(screen.getByText('Choose uphold, overturn or modify.')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Uphold' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Overturn' }));
    await user.click(screen.getByLabelText(/Rationale/));
    await user.paste('It quotes the film being discussed.');
    await user.click(screen.getByRole('button', { name: 'Resolve appeal' }));
    expect(
      await screen.findByText('Appeal resolved - decision overturned, the content is visible again.'),
    ).toBeVisible();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/appeals/appeal1/resolve');
    expect(JSON.parse(String(init.body))).toEqual({
      outcome: 'overturn',
      rationale: 'It quotes the film being discussed.',
    });
  });

  it('[APP-5] a resolved appeal shows the result instead of the form', () => {
    renderWithProviders(
      <AppealBody
        detail={makeAppeal({
          status: 'resolved',
          caseStatus: 'appeal_resolved',
          outcome: {
            outcome: 'modify',
            finalAction: 'label',
            rationale: 'A label is enough.',
            resolver: { id: 'senior2', name: 'Elif Demir' },
            resolvedAt: '2026-11-07T11:00:00.000Z',
          },
          permissions: { canResolve: false, isOriginalDecider: false, readOnly: false },
        })}
        onReload={() => undefined}
      />,
    );
    const outcome = screen.getByRole('region', { name: 'Outcome' });
    expect(within(outcome).getByText('Modified')).toBeVisible();
    expect(within(outcome).getByText('A label is enough.')).toBeVisible();
    expect(within(outcome).queryByRole('form')).toBeNull();
  });
});

describe('resolve form rules', () => {
  const original = { finalAction: 'limit' as const, clauseCodes: ['PII-1'] };

  it('[APP-5] modify needs a new action that a decision clause allows, and every outcome needs a rationale', () => {
    expect(validateResolve({ outcome: 'modify', finalAction: null, rationale: 'x' }, original, CLAUSES)).toEqual({
      finalAction: 'Choose the new action.',
      rationale: 'Explain the outcome in at least 10 characters.',
    });
    expect(modifyActionReason('limit', original, CLAUSES)).toBe(
      'This is the current action. Choose Uphold to keep it.',
    );
    expect(modifyActionReason('label', original, CLAUSES)).toBe('None of PII-1 allows label.');
    expect(modifyActionReason('remove', original, CLAUSES)).toBeNull();
  });

  it('[APP-5] the success message names the outcome', () => {
    expect(resolveSuccessMessage({ outcome: 'uphold', finalAction: 'limit' })).toBe(
      'Appeal resolved - decision upheld.',
    );
    expect(resolveSuccessMessage({ outcome: 'modify', finalAction: 'remove' })).toBe(
      'Appeal resolved - the content is now removed.',
    );
  });
});
