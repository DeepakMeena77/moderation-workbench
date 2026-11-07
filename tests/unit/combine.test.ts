import { describe, expect, it } from 'vitest';
import type { AiStatus } from '@/server/ai/types';
import type { VerificationReport, VerifiedFinding, VerifiedOutput } from '@/server/ai/verify';
import { combine, type AiOutcome, type CombineInput, type RuleFinding } from '@/server/moderation/combine';
import { computePriority } from '@/server/moderation/priority';
import { POLICY } from './helpers/ai';

const SETTINGS = { autoClearEnabled: true, autoClearMinConfidence: 0.85, humanConfidenceThreshold: 0.7 };
const NO_ISSUES: VerificationReport = {
  invalidCitations: [],
  unverifiedQuotes: [],
  droppedFindings: 0,
  actionLowered: null,
};

function aiFinding(overrides: Partial<VerifiedFinding> = {}): VerifiedFinding {
  return {
    clauseCode: 'HAR-1',
    evidenceType: 'confirmed',
    quotes: [{ text: 'idiot', start: 10, end: 15 }],
    interpretation: 'Insult.',
    severity: 'medium',
    severityReason: 'r',
    confidence: 0.9,
    confidenceReason: 'r',
    ...overrides,
  };
}

function aiOk(output: Partial<VerifiedOutput> = {}, extra: Partial<AiOutcome> = {}): AiOutcome {
  return {
    status: 'ok',
    output: {
      findings: [],
      proposedAction: 'none',
      overallSeverity: 'low',
      overallConfidence: 0.95,
      confidenceReason: 'r',
      needsHumanReview: false,
      humanReviewReasons: [],
      insufficientContext: false,
      ...output,
    },
    verification: NO_ISSUES,
    injectionSignals: [],
    unavailableReason: null,
    ...extra,
  };
}

function aiDown(status: AiStatus = 'timeout', reason = 'AI did not answer in time - retry later'): AiOutcome {
  return { status, output: null, verification: null, injectionSignals: [], unavailableReason: reason };
}

function rule(clauseCode: string, severity: RuleFinding['severity'] = 'low'): RuleFinding {
  return { ruleId: 'keyword', clauseCode, quotes: [{ text: 'x', start: 0, end: 1 }], confidence: 1, severity };
}

function run(overrides: Partial<CombineInput> = {}) {
  return combine({ policy: POLICY, ruleFindings: [], ai: aiOk(), reportCount: 0, settings: SETTINGS, ...overrides });
}

describe('combine: needs human (AI-6)', () => {
  it('[AI-7] a clean, confident AI result with no findings or reports is auto-cleared', () => {
    const rec = run();
    expect(rec).toMatchObject({ action: 'none', needsHuman: false, reasons: [], autoClear: true, severity: null });
  });

  it('[AI-6] [DET-5] the AI is unavailable: rule findings are kept and a human is needed', () => {
    const rec = run({ ai: aiDown('rate_limited', 'AI quota reached - retry later'), ruleFindings: [rule('SPAM-1')] });
    expect(rec.needsHuman).toBe(true);
    expect(rec.confidence).toBeNull();
    expect(rec.clauseCodes).toEqual(['SPAM-1']);
    expect(rec.action).toBe('label');
    expect(rec.reasons[0]).toContain('AI quota reached - retry later');
    expect(rec.reasons.join(' ')).not.toContain('disagree');
  });

  it('[AI-6] an action other than none needs a human', () => {
    const rec = run({ ai: aiOk({ findings: [aiFinding()], proposedAction: 'label' }) });
    expect(rec.action).toBe('label');
    expect(rec.reasons).toContain('The recommended action is "label"; any action needs a human decision.');
  });

  it('[AI-6] the AI asked for review: its reasons are listed with an "AI:" prefix', () => {
    const rec = run({ ai: aiOk({ needsHumanReview: true, humanReviewReasons: ['Sarcasm is possible'] }) });
    expect(rec.reasons).toContain('AI: Sarcasm is possible');
    const bare = run({ ai: aiOk({ needsHumanReview: true }) });
    expect(bare.reasons).toContain('AI: asked for human review.');
  });

  it('[AI-6] confidence below the threshold needs a human', () => {
    const rec = run({ ai: aiOk({ overallConfidence: 0.69 }) });
    expect(rec.reasons).toContain('AI confidence 0.69 is below 0.70.');
    expect(run({ ai: aiOk({ overallConfidence: 0.7 }) }).reasons).toEqual([]);
  });

  it('[AI-6] any high severity finding needs a human', () => {
    const rec = run({
      ruleFindings: [rule('HATE-1', 'high')],
      ai: aiOk({ findings: [aiFinding({ clauseCode: 'HATE-1', severity: 'high' })], proposedAction: 'label' }),
    });
    expect(rec.severity).toBe('high');
    expect(rec.reasons).toContain('High severity finding (HATE-1).');
  });

  it('[AI-6] [Q-2] an alwaysEscalate clause needs a human and gets priority 100', () => {
    const rec = run({
      ai: aiOk({ findings: [aiFinding({ clauseCode: 'SH-1', severity: 'high' })], proposedAction: 'limit' }),
    });
    expect(rec.reasons).toContain('Clause SH-1 always goes to a human.');
    expect(rec.priority).toBe(100);
  });

  it('[AI-6] [DET-5] rules found a clause the AI did not cite: rules and AI disagree', () => {
    const rec = run({ ruleFindings: [rule('SPAM-1')] });
    expect(rec.reasons).toContain('Rules and AI disagree: rules found SPAM-1, the AI did not.');
    const agree = run({
      ruleFindings: [rule('HAR-1', 'medium')],
      ai: aiOk({ findings: [aiFinding()], proposedAction: 'label' }),
    });
    expect(agree.reasons.join(' ')).not.toContain('disagree');
  });

  it('[AI-6] an invalid citation needs a human', () => {
    const rec = run({ ai: aiOk({}, { verification: { ...NO_ISSUES, invalidCitations: ['XYZ-9'] } }) });
    expect(rec.reasons).toContain('AI cited clauses that are not in policy v1: XYZ-9 (removed).');
  });

  it('[AI-6] an unverified quote needs a human', () => {
    const rec = run({ ai: aiOk({}, { verification: { ...NO_ISSUES, unverifiedQuotes: ['HAR-1'] } }) });
    expect(rec.reasons).toContain('AI quotes not found in the content (HAR-1); treated as interpretation.');
  });

  it('[AI-6] reported content needs a human', () => {
    expect(run({ reportCount: 1 }).reasons).toContain('Reported by 1 user.');
    expect(run({ reportCount: 3 }).reasons).toContain('Reported by 3 users.');
  });

  it('[AI-6] insufficientContext needs a human', () => {
    expect(run({ ai: aiOk({ insufficientContext: true }) }).reasons).toContain(
      'AI: not enough context to judge this content.',
    );
  });

  it('[AI-8] content that addresses the AI needs a human even when the AI saw nothing', () => {
    const rec = run({ ai: aiOk({}, { injectionSignals: ['override_instructions'] }) });
    expect(rec.needsHuman).toBe(true);
    expect(rec.autoClear).toBe(false);
    expect(rec.reasons).toContain('The content contains instructions aimed at the AI; they were treated as content.');
  });
});

describe('combine: action, severity, auto-clear', () => {
  it('[AI-6] the action is the stronger of the AI action and each rule-hit clause default', () => {
    const rec = run({
      ruleFindings: [rule('PII-1', 'medium')],
      ai: aiOk({ findings: [aiFinding()], proposedAction: 'label' }),
    });
    expect(rec.action).toBe('limit');
    expect(rec.clauseCodes).toEqual(['HAR-1', 'PII-1']);
  });

  it('[AI-4] the combined action is never above what the cited clauses allow', () => {
    const rec = run({
      ai: aiOk({ findings: [aiFinding({ clauseCode: 'SH-1', severity: 'high' })], proposedAction: 'remove' }),
    });
    expect(rec.action).toBe('limit');
  });

  it.each([
    ['auto-clear is disabled', { settings: { ...SETTINGS, autoClearEnabled: false } }],
    ['the AI failed', { ai: aiDown() }],
    ['a rule found something', { ruleFindings: [rule('SPAM-1')] }],
    ['the AI found something', { ai: aiOk({ findings: [aiFinding({ interpretation: 'x' })] }) }],
    ['the content was reported', { reportCount: 1 }],
    ['confidence is below 0.85', { ai: aiOk({ overallConfidence: 0.84 }) }],
    ['a needs-human reason applies', { ai: aiOk({ insufficientContext: true }) }],
  ] as Array<[string, Partial<CombineInput>]>)('[AI-7] no auto-clear when %s', (_label, overrides) => {
    expect(run(overrides).autoClear).toBe(false);
  });

  it('[AI-7] confidence between the human threshold and the auto-clear bar: no reason, but no auto-clear', () => {
    const rec = run({ ai: aiOk({ overallConfidence: 0.8 }) });
    expect(rec).toMatchObject({ needsHuman: false, autoClear: false });
  });

  it('[HUM-1] a recommendation carries no visibility change', () => {
    expect(Object.keys(run())).not.toContain('visibility');
  });
});

describe('priority (Q-2)', () => {
  it('[Q-2] base by severity, plus 10 per report up to 30, plus 5 when a human is needed, capped at 99', () => {
    expect(computePriority({ severity: null, reportCount: 0, needsHuman: false, alwaysEscalate: false })).toBe(10);
    expect(computePriority({ severity: 'low', reportCount: 1, needsHuman: true, alwaysEscalate: false })).toBe(40);
    expect(computePriority({ severity: 'medium', reportCount: 5, needsHuman: true, alwaysEscalate: false })).toBe(85);
    expect(computePriority({ severity: 'high', reportCount: 3, needsHuman: true, alwaysEscalate: false })).toBe(99);
  });

  it('[Q-2] an alwaysEscalate clause gives 100', () => {
    expect(computePriority({ severity: 'low', reportCount: 0, needsHuman: false, alwaysEscalate: true })).toBe(100);
  });

  it('[Q-2] combine applies the formula to its own result', () => {
    const rec = run({ reportCount: 2, ai: aiOk({ findings: [aiFinding()], proposedAction: 'label' }) });
    expect(rec.priority).toBe(50 + 20 + 5);
  });
});
