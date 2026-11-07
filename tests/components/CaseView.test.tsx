import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { AiDetail, AiRun } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { CaseBody } from '@/ui/features/case/CaseView';
import { theme } from '@/ui/theme/theme';
import { makeDetail } from './helpers/caseDetail';

/** The whole "Confidence: ..." line of a ConfidenceMeter (its label is split across a span and text). */
const meterLines = (root: HTMLElement = document.body) =>
  within(root)
    .getAllByText((_, el) => el?.tagName === 'P' && /^Confidence:/.test(el.textContent ?? ''))
    .map((el) => el.textContent);

// The case page body (03 sec. 6.6; AI-5, AI-10, HUM-7, DET-5, SEC-3).

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

const AI: AiDetail = {
  findings: [
    {
      source: 'ai',
      ruleId: null,
      clauseCode: 'HAR-1',
      evidenceType: 'confirmed',
      quotes: [{ text: 'worthless idiot', start: 10, end: 25 }],
      interpretation: 'Direct insult at the reader.',
      severity: 'medium',
      severityReason: 'A direct insult without a threat.',
      confidence: 0.92,
      confidenceReason: 'Explicit insult with no benign reading.',
    },
    {
      source: 'ai',
      ruleId: null,
      clauseCode: 'HAR-1',
      evidenceType: 'interpretation',
      quotes: [],
      interpretation: 'Possibly part of a running feud.',
      severity: 'low',
      severityReason: 'Context is unclear.',
      confidence: 0.5,
      confidenceReason: 'Depends on earlier messages.',
    },
  ],
  invalidCitations: ['HAR-9'],
  unverifiedQuotes: [],
  actionLowered: null,
  severityReason: null,
  confidenceReason: 'Clear insult.',
  insufficientContext: false,
};

const RUN: AiRun = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  modelsTried: ['gemini-2.5-flash'],
  fallbackUsed: false,
  promptVersion: 'classify.v1',
  inputTokens: 812,
  outputTokens: 164,
  thinkingTokens: 0,
  costUsd: 0.000654,
  latencyMs: 1432,
  attempts: 1,
  parseStrategy: 'direct',
  repairUsed: false,
  status: 'ok',
  errorCode: null,
};

function withAi() {
  const detail = makeDetail();
  if (!detail.analysis) throw new Error('fixture');
  return makeDetail({
    analysis: {
      ...detail.analysis,
      aiStatus: 'ok',
      ai: AI,
      aiRun: RUN,
      recommendation: { ...detail.analysis.recommendation, confidence: 0.9 },
    },
  });
}

describe('case page', () => {
  it('[DET-5] without an AI result it shows the rule findings and "AI review pending or unavailable"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CaseBody detail={makeDetail()} onReload={() => undefined} />);
    expect(screen.getByText(/AI review pending or unavailable\. Rule findings are shown/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Finding HAR-1' })).toBeInTheDocument();
    const recommendation = screen.getByRole('region', { name: 'Recommendation' });
    expect(meterLines(recommendation)).toEqual(['Confidence: AI review pending or unavailable']);
    await user.click(screen.getByRole('button', { name: 'AI run details' }));
    expect(screen.getByText(/AI review pending or unavailable\. Rule findings are shown \(label/)).toBeInTheDocument();
  });

  it('[AI-5] shows a severity reason and a confidence reason for each finding', () => {
    renderWithProviders(<CaseBody detail={withAi()} onReload={() => undefined} />);
    expect(screen.getByText('Severity: A direct insult without a threat.')).toBeInTheDocument();
    expect(screen.getByText('Explicit insult with no benign reading.')).toBeInTheDocument();
    const meters = meterLines();
    expect(meters).toContain('Confidence: 0.92, Explicit');
    expect(meters).toContain('Confidence: 0.90, Explicit');
    // Rule findings get reasons stated from the rule itself.
    expect(screen.getByText('Severity: Default severity of HAR-1 in policy v1.')).toBeInTheDocument();
    expect(screen.getByText('Deterministic match: the keyword rule found the exact text.')).toBeInTheDocument();
    // The three groups, with the interpretation and the dropped citation in their own groups.
    expect(screen.getByRole('heading', { name: 'AI interpretation - not verified evidence' })).toBeInTheDocument();
    expect(screen.getByText('Possibly part of a running feud.')).toBeInTheDocument();
    expect(screen.getByText('Removed: HAR-9 is not a clause of policy v1.')).toBeInTheDocument();
  });

  it('[AI-10] shows the AI run details: model, tokens, cost, latency, attempts and parse strategy', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CaseBody detail={withAi()} onReload={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'AI run details' }));
    expect(screen.getByText('Model', { selector: 'dt' }).nextElementSibling).toHaveTextContent('gemini-2.5-flash');
    expect(screen.getByText('812 / 164 / 0')).toBeInTheDocument();
    expect(screen.getByText('$0.000654')).toBeInTheDocument();
    expect(screen.getByText('1432 ms')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
  });

  it('[AI-6] lists why a human must decide next to the recommendation', () => {
    renderWithProviders(<CaseBody detail={makeDetail()} onReload={() => undefined} />);
    const group = screen.getByRole('group', { name: 'Why a human must decide' });
    expect(group).toHaveTextContent('AI review unavailable - rule findings only.');
  });

  it('[HUM-7] an admin sees the read-only banner and no decision controls', () => {
    renderWithProviders(
      <CaseBody
        detail={makeDetail({
          permissions: { canDecide: false, canReanalyze: false, canReopen: false, readOnly: true },
        })}
        onReload={() => undefined}
      />,
    );
    expect(screen.getByText('Read-only oversight')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve recommendation/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Re-analyse' })).toBeNull();
  });

  it('[HUM-5] a decided case shows the AI suggestion and the human outcome side by side', () => {
    renderWithProviders(
      <CaseBody
        detail={makeDetail({
          status: 'resolved',
          permissions: { canDecide: false, canReanalyze: false, canReopen: false, readOnly: false },
          decision: {
            id: 'd1',
            kind: 'modify',
            decider: { id: 'm1', name: 'Mo Reviewer' },
            analysisSeq: 1,
            policyVersion: 1,
            recommendedAction: 'label',
            finalAction: 'limit',
            clauseCodes: ['HAR-1'],
            reasonCategory: 'severity_too_low',
            rationale: 'Repeated insults at the same person.',
            createdAt: new Date().toISOString(),
          },
        })}
        onReload={() => undefined}
      />,
    );
    expect(screen.getByText(/Mo Reviewer chose to modify the recommendation/)).toBeInTheDocument();
    expect(screen.getByText(/reason: Severity too low/)).toBeInTheDocument();
  });

  it('[SEC-3] content and parent text with markup render as text', () => {
    const { container } = renderWithProviders(
      <CaseBody
        detail={makeDetail({
          content: {
            ...makeDetail().content,
            body: '<script>alert(1)</script>',
            parent: { id: 'p1', body: '<b>bold?</b>', authorName: 'Ben' },
          },
          analysis: null,
          versions: [],
        })}
        onReload={() => undefined}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });
});
