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

  it('[AI-4] an action weaker than allowed is never raised', () => {
    const content = 'I will hurt you';
    const { output: out, report } = verifyOutput(
      output([finding({ clauseCode: 'THR-1', quotes: ['I will hurt you'], severity: 'high' })], {
        proposedAction: 'label',
      }),
      POLICY,
      content,
    );
    expect(out.proposedAction).toBe('label');
    expect(report.actionLowered).toBeNull();
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
