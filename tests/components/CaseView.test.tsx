import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from './helpers/userEvent';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { AiDetail, AiRun } from '@/ui/api/hooks';
import { SnackbarProvider } from '@/ui/components/SnackbarProvider';
import { charRangeLabel, evidenceSourceLabel } from '@/ui/features/case/CaseSections';
import { CaseBody, caseContextLine } from '@/ui/features/case/CaseView';
import { theme } from '@/ui/theme/theme';
import { makeDetail } from './helpers/caseDetail';

/** The whole "Confidence: ..." line of a ConfidenceMeter (its label is split across a span and text). */
const meterLines = (root: HTMLElement = document.body) =>
  within(root)
    .getAllByText((_, el) => el?.tagName === 'P' && /^Confidence:/.test(el.textContent ?? ''))
    .map((el) => el.textContent);

/** The value under a label in the recommendation summary (a dt and its dd). */
const glance = (label: string) => {
  const summary = screen.getByRole('region', { name: 'Recommendation' });
  return within(summary).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
};

// The case page body (03 sec. 6.6; AI-3, AI-5, AI-10, CNT-4, HUM-7, DET-5, SEC-3).

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
    expect(glance('AI confidence in this result')).toBe('NoneAI pending');
    await user.click(screen.getByRole('button', { name: 'AI run details' }));
    expect(screen.getByText(/AI review pending or unavailable\. Rule findings are shown \(label/)).toBeInTheDocument();
  });

  it('[AI-5] shows a severity reason and a confidence reason for each finding', () => {
    renderWithProviders(<CaseBody detail={withAi()} onReload={() => undefined} />);
    expect(screen.getByText('Severity: A direct insult without a threat.')).toBeInTheDocument();
    expect(screen.getByText('Explicit insult with no benign reading.')).toBeInTheDocument();
    const meters = meterLines();
    expect(meters).toContain('Confidence: 0.92, Explicit');
    expect(meters).toContain('Confidence: 1.00, Explicit');
    expect(glance('AI confidence in this result')).toBe('0.90Overall, for the whole result');
    expect(screen.getByText('Confidence: Clear insult.')).toBeInTheDocument();
    // Rule findings get reasons stated from the rule itself.
    expect(screen.getByText('Severity: Default severity of HAR-1 in policy v1.')).toBeInTheDocument();
    expect(screen.getByText('Deterministic match: the keyword rule found the exact text.')).toBeInTheDocument();
    // The three groups, with the interpretation and the dropped citation in their own groups.
    expect(
      screen.getByRole('heading', { name: 'AI interpretation - a reading of context, not confirmed evidence' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Possibly part of a running feud.')).toBeInTheDocument();
    expect(screen.getByText('Removed: HAR-9 is not a clause of policy v1.')).toBeInTheDocument();
  });

  it('[CNT-4] the header links back to the queue and to the full history, with a monospace context line', () => {
    renderWithProviders(<CaseBody detail={makeDetail()} onReload={() => undefined} backHref="/queue?trigger=report" />);
    expect(screen.getByRole('link', { name: 'Back to queue' })).toHaveAttribute('href', '/queue?trigger=report');
    expect(screen.getByRole('link', { name: 'Full moderation history' })).toHaveAttribute(
      'href',
      '/content/c1/history',
    );
    const dot = String.fromCharCode(0xb7);
    expect(screen.getByText(`case case1 ${dot} flagged by rules ${dot} priority 55`)).toBeInTheDocument();
    const title = screen.getByRole('heading', { level: 1, name: 'Post by Asha Rao' });
    expect(title.parentElement).toHaveTextContent('Needs review');
    expect(screen.getByRole('region', { name: 'Post by Asha Rao' })).toBeInTheDocument();
  });

  it('[CNT-4] a reported case says it entered the queue from a user report', () => {
    renderWithProviders(<CaseBody detail={makeDetail({ entry: 'report' })} onReload={() => undefined} />);
    expect(screen.getByText(/user report/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to queue' })).toHaveAttribute('href', '/queue');
  });

  it('[AI-5] the recommendation shows action, severity and confidence as three labelled values, then the policy', () => {
    renderWithProviders(<CaseBody detail={withAi()} onReload={() => undefined} />);
    expect(glance('Proposed action')).toBe('Label');
    // The severity says where it comes from: the first finding at that level, rules before AI.
    expect(glance('Severity')).toBe('Mediumfrom HAR-1 rule');
    expect(glance('AI confidence in this result')).toBe('0.90Overall, for the whole result');
    const summary = screen.getByRole('region', { name: 'Recommendation' });
    const text = summary.textContent ?? '';
    // The values come first, the explanation after them, and the policy version last.
    expect(text.indexOf('Proposed action')).toBeLessThan(text.indexOf('Why a human must decide'));
    expect(text.trim().endsWith('Analysed under policy v1, analysis v1 of 1')).toBe(true);
  });

  it('[AI-3] each confirmed quote names its source and its character range', () => {
    renderWithProviders(<CaseBody detail={withAi()} onReload={() => undefined} />);
    const findings = screen.getAllByRole('group', { name: 'Finding HAR-1' });
    const ruleFinding = findings.find((g) => within(g).queryByText('Rule - keyword'));
    const aiFinding = findings.find((g) => within(g).queryByText('"worthless idiot"'));
    expect(ruleFinding && within(ruleFinding).getByText('chars 20-25')).toBeInTheDocument();
    expect(aiFinding && within(aiFinding).getByText('AI')).toBeInTheDocument();
    expect(aiFinding && within(aiFinding).getByText('chars 10-25')).toBeInTheDocument();
    // An interpretation is not evidence, so it carries no source tag or range.
    const interpretation = findings.find((g) => within(g).queryByText('Possibly part of a running feud.'));
    expect(interpretation && within(interpretation).queryByText(/^chars /)).toBeNull();
  });

  it('[AI-3] source and range labels', () => {
    expect(evidenceSourceLabel({ source: 'rule', ruleId: 'links' })).toBe('Rule - links');
    expect(evidenceSourceLabel({ source: 'ai', ruleId: null })).toBe('AI');
    expect(charRangeLabel({ text: 'x', start: 44, end: 61 })).toBe('chars 44-61');
    expect(charRangeLabel({ text: 'x', start: null, end: null })).toBeNull();
    const dot = String.fromCharCode(0xb7);
    expect(caseContextLine({ id: 'cm9abcdefghijk', entry: 'ai', priority: 80 })).toBe(
      `case efghijk ${dot} flagged by AI ${dot} priority 80`,
    );
    expect(caseContextLine({ id: 'c2', entry: null, priority: 0 })).toBe(
      `case c2 ${dot} no findings ${dot} priority 0`,
    );
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
    expect(screen.queryByRole('radiogroup', { name: 'Decision' })).toBeNull();
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
            policyChange: null,
          },
        })}
        onReload={() => undefined}
      />,
    );
    expect(screen.getByText(/Mo Reviewer chose to modify the recommendation/)).toBeInTheDocument();
    expect(screen.getByText(/reason: Severity too low/)).toBeInTheDocument();
    expect(screen.queryByText(/Policy changed since this decision/)).toBeNull();
  });

  it('[POL-4] a decision made under an older policy says the policy changed since, and keeps its version', () => {
    renderWithProviders(
      <CaseBody
        detail={makeDetail({
          status: 'resolved',
          permissions: { canDecide: false, canReanalyze: false, canReopen: false, readOnly: false },
          decision: {
            id: 'd1',
            kind: 'approve',
            decider: { id: 'm1', name: 'Mo Reviewer' },
            analysisSeq: 1,
            policyVersion: 1,
            recommendedAction: 'label',
            finalAction: 'label',
            clauseCodes: ['HAR-1'],
            reasonCategory: null,
            rationale: null,
            createdAt: new Date().toISOString(),
            policyChange: { fromVersion: 1, toVersion: 2, message: 'Policy changed since this decision (v1 -> v2)' },
          },
        })}
        onReload={() => undefined}
      />,
    );
    expect(
      screen.getByText('Policy changed since this decision (v1 -> v2). The decision stays under v1.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Policy v1, analysis v1/)).toBeInTheDocument();
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
