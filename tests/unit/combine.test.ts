import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combine, RULE_ONLY_REASON } from '@/server/moderation/combine';
import { computePriority } from '@/server/moderation/priority';
import { policyFileSchema, type ActivePolicy } from '@/server/policy/schema';
import { runRules } from '@/server/rules';

// The rule-only recommendation of S2 (S3 adds the AI side) and the queue priority formula.

const file = policyFileSchema.parse(JSON.parse(readFileSync('policies/policy.v1.json', 'utf8')));
const v1: ActivePolicy = { version: 1, clauses: file.clauses };
const rulesFor = (text: string) => runRules(text, v1, { createdAt: new Date(), recentByAuthor: [] });
const unavailable = { status: 'unavailable', reason: RULE_ONLY_REASON } as const;

describe('combine (rule-only)', () => {
  it('[DET-5] with the AI unavailable, rule findings still drive the recommendation and a human must decide', () => {
    const result = combine({
      policy: v1,
      ruleFindings: rulesFor('You worthless idiot'),
      reportCount: 0,
      ai: unavailable,
    });
    expect(result).toMatchObject({
      action: 'label',
      severity: 'medium',
      confidence: null,
      needsHuman: true,
      autoClear: false,
      clauseCodes: ['HAR-1'],
    });
    expect(result.reasons[0]).toBe('AI review unavailable - rule findings only.');
    expect(result.reasons).toContain('The suggested action is "label", not "none".');
  });

  it('[DET-5] clean text with the AI unavailable is never auto-cleared', () => {
    const result = combine({ policy: v1, ruleFindings: [], reportCount: 0, ai: unavailable });
    expect(result).toMatchObject({ action: 'none', severity: null, needsHuman: true, autoClear: false });
  });

  it('[DET-5] the strongest default action of the hit clauses wins and reports are listed', () => {
    const result = combine({
      policy: v1,
      ruleFindings: rulesFor("You idiot, I'm going to hurt you"),
      reportCount: 2,
      ai: unavailable,
    });
    expect(result.action).toBe('remove');
    expect(result.severity).toBe('high');
    expect(result.alwaysEscalate).toBe(true);
    expect(result.priority).toBe(100);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['THR-1 always needs a human decision.', 'Reported by 2 users.']),
    );
  });
});

describe('priority', () => {
  it('[Q-2] an alwaysEscalate clause gives 100', () => {
    expect(computePriority({ severity: 'low', reportCount: 0, needsHuman: false, alwaysEscalate: true })).toBe(100);
  });

  it('[Q-2] base by severity, plus 10 per report up to 30, plus 5 when a human is needed, capped at 99', () => {
    expect(computePriority({ severity: null, reportCount: 0, needsHuman: false, alwaysEscalate: false })).toBe(10);
    expect(computePriority({ severity: 'low', reportCount: 1, needsHuman: true, alwaysEscalate: false })).toBe(40);
    expect(computePriority({ severity: 'medium', reportCount: 5, needsHuman: true, alwaysEscalate: false })).toBe(85);
    expect(computePriority({ severity: 'high', reportCount: 3, needsHuman: true, alwaysEscalate: false })).toBe(99);
  });
});
