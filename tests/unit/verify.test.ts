import { describe, expect, it } from 'vitest';
import type { AiFinding, ClassifyOutput } from '@/server/ai/output';
import { findQuote, verifyOutput } from '@/server/ai/verify';
import { POLICY } from './helpers/ai';

function finding(overrides: Partial<AiFinding> = {}): AiFinding {
  return {
    clauseCode: 'HAR-1',
    evidenceType: 'confirmed',
    quotes: ['worthless idiot'],
    interpretation: 'A direct insult.',
    severity: 'medium',
    severityReason: 'Insult without threat.',
    confidence: 0.92,
    confidenceReason: 'Explicit.',
    ...overrides,
  };
}

function output(findings: AiFinding[], overrides: Partial<ClassifyOutput> = {}): ClassifyOutput {
  return {
    findings,
    proposedAction: 'label',
    overallSeverity: 'medium',
    overallConfidence: 0.9,
    confidenceReason: 'Clear.',
    needsHumanReview: true,
    humanReviewReasons: [],
    insufficientContext: false,
    ...overrides,
  };
}

const CONTENT = 'You are a worthless idiot';

describe('verify', () => {
  it('[AI-2] a finding citing a clause that is not in the policy version is removed and flagged', () => {
    const { output: out, report } = verifyOutput(
      output([finding(), finding({ clauseCode: 'XYZ-9' })]),
      POLICY,
      CONTENT,
    );
    expect(out.findings.map((f) => f.clauseCode)).toEqual(['HAR-1']);
    expect(report.invalidCitations).toEqual(['XYZ-9']);
  });

  it('[AI-3] a verbatim quote is found ignoring case and whitespace, with offsets into the original', () => {
    const content = 'Honestly, you are a   WORTHLESS\n idiot.';
    const span = findQuote(content, 'worthless idiot');
    expect(span).not.toBeNull();
    expect(content.slice(span?.start, span?.end)).toBe('WORTHLESS\n idiot');
    expect(span?.text).toBe('WORTHLESS\n idiot');
  });

  it('[AI-3] offsets stay correct after characters outside the BMP', () => {
    const content = '\u{1F600}\u{1F600} you idiot';
    const span = findQuote(content, 'you idiot');
    expect(span).toEqual({ text: 'you idiot', start: 5, end: 14 });
  });

  it('[AI-3] a quote copied from the escaped prompt matches the raw content', () => {
    const content = 'see <b>you idiot</b>';
    expect(findQuote(content, '&lt;b&gt;you idiot')?.text).toBe('<b>you idiot');
  });

  it('[AI-3] an invented quote moves the finding to interpretation and caps confidence at 0.5', () => {
    const { output: out, report } = verifyOutput(
      output([finding({ quotes: ['this sentence is not in the content'], confidence: 0.95 })], {
        overallConfidence: 0.95,
      }),
      POLICY,
      CONTENT,
    );
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ evidenceType: 'interpretation', quotes: [], confidence: 0.5 });
    expect(out.overallConfidence).toBeLessThanOrEqual(0.5);
    expect(report.unverifiedQuotes).toEqual(['HAR-1']);
  });

  it('[AI-3] confirmed evidence with no quote is treated as interpretation', () => {
    const { output: out, report } = verifyOutput(output([finding({ quotes: [] })]), POLICY, CONTENT);
    expect(out.findings[0]).toMatchObject({ evidenceType: 'interpretation', confidence: 0.5 });
    expect(report.unverifiedQuotes).toEqual(['HAR-1']);
  });

  it('[AI-3] a speculative interpretation (confidence below 0.4) carries at most low severity, with the reason', () => {
    const speculative = finding({
      evidenceType: 'interpretation',
      quotes: [],
      interpretation: 'Probably quoting a news report.',
      severity: 'high',
      severityReason: 'Threat wording.',
      confidence: 0.2,
    });
    const { output: out } = verifyOutput(output([speculative]), POLICY, CONTENT);
    expect(out.findings[0]).toMatchObject({ severity: 'low', confidence: 0.2 });
    expect(out.findings[0]?.severityReason).toMatch(/^Speculative \(confidence below 0.4\), so capped at low\./);
  });

  it('[AI-3] an interpretation at 0.4 or above keeps its severity', () => {
    const likely = finding({
      evidenceType: 'interpretation',
      quotes: [],
      interpretation: 'Implied threat.',
      severity: 'high',
      confidence: 0.6,
    });
    const { output: out } = verifyOutput(output([likely]), POLICY, CONTENT);
    expect(out.findings[0]).toMatchObject({ severity: 'high' });
  });

  it('[AI-3] a finding with no verified quote and no interpretation is dropped', () => {
    const { output: out, report } = verifyOutput(
      output([finding({ quotes: ['not there'], interpretation: '' })]),
      POLICY,
      CONTENT,
    );
    expect(out.findings).toEqual([]);
    expect(report.droppedFindings).toBe(1);
  });

  it('[AI-4] a disallowed action is lowered to the strongest action the cited clauses allow', () => {
    const content = 'I want to end my life';
    const { output: out, report } = verifyOutput(
      output([finding({ clauseCode: 'SH-1', quotes: ['end my life'], severity: 'high' })], {
        proposedAction: 'remove',
      }),
      POLICY,
      content,
    );
    expect(out.proposedAction).toBe('limit');
    expect(report.actionLowered).toEqual({ from: 'remove', to: 'limit' });
  });

  it('[AI-4] an action below every allowed action is never raised: it goes to none', () => {
    // THR-1 allows limit and remove only. "label" is not allowed, and the only allowed action at or below it is
    // "none"; raising it to "limit" would be the AI's action made stronger. THR-1 always goes to a human anyway.
    const content = 'I will hurt you';
    const { output: out, report } = verifyOutput(
      output([finding({ clauseCode: 'THR-1', quotes: ['I will hurt you'], severity: 'high' })], {
        proposedAction: 'label',
      }),
      POLICY,
      content,
    );
    expect(out.proposedAction).toBe('none');
    expect(report.actionLowered).toEqual({ from: 'label', to: 'none' });
  });

  // Clauses that allow label and remove but not limit: the lowering target is the strongest allowed action at or
  // below the proposal, not simply the strongest allowed action.
  const GAPPED = {
    ...POLICY,
    clauses: POLICY.clauses.map((c) =>
      c.code === 'HAR-1' ? { ...c, allowedActions: ['label', 'remove'] as Array<'label' | 'remove'> } : c,
    ),
  };

  it('[AI-4] limit proposed where only label and remove are allowed is lowered to label, never raised to remove', () => {
    const { output: out, report } = verifyOutput(output([finding()], { proposedAction: 'limit' }), GAPPED, CONTENT);
    expect(out.proposedAction).toBe('label');
    expect(report.actionLowered).toEqual({ from: 'limit', to: 'label' });
  });

  it('[AI-4] an allowed proposal is kept as it is, at either end of a gapped set', () => {
    for (const proposedAction of ['label', 'remove', 'none'] as const) {
      const { output: out, report } = verifyOutput(output([finding()], { proposedAction }), GAPPED, CONTENT);
      expect(out.proposedAction).toBe(proposedAction);
      expect(report.actionLowered).toBeNull();
    }
  });

  it('[AI-4] with every finding removed, any proposed action is lowered to none', () => {
    const { output: out, report } = verifyOutput(
      output([finding({ clauseCode: 'XYZ-9' })], { proposedAction: 'remove' }),
      POLICY,
      CONTENT,
    );
    expect(out.proposedAction).toBe('none');
    expect(report.actionLowered).toEqual({ from: 'remove', to: 'none' });
  });
});
