import { describe, expect, it } from 'vitest';
import type { VerifiedOutput } from '@/server/ai/verify';
import { combine, type AiOutcome, type RuleFinding } from '@/server/moderation/combine';
import { rankReasons, reasonRank } from '@/server/moderation/reasonOrder';
import { POLICY } from './helpers/ai';

// The order of "why a human must decide" (AI-6): the most specific reason first, the generic one last.

const SETTINGS = { autoClearEnabled: true, autoClearMinConfidence: 0.85, humanConfidenceThreshold: 0.7 };
const GENERIC = 'The recommended action is "label"; any action needs a human decision.';

function aiOk(output: Partial<VerifiedOutput>, extra: Partial<AiOutcome> = {}): AiOutcome {
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
    verification: { invalidCitations: [], unverifiedQuotes: [], droppedFindings: 0, actionLowered: null },
    injectionSignals: [],
    unavailableReason: null,
    ...extra,
  };
}

const rule = (clauseCode: string): RuleFinding => ({
  ruleId: 'keyword',
  clauseCode,
  evidenceType: 'confirmed',
  quotes: [{ text: 'x', start: 0, end: 1 }],
  confidence: 1,
  severity: 'low',
});

describe('reason order', () => {
  it('[AI-6] ranks the reasons most specific first, with the generic action reason last', () => {
    const ranked = rankReasons([
      GENERIC,
      'AI result missing: AI did not answer in time - retry later. Rule findings only.',
      'AI: not enough context to judge this content.',
      'AI confidence 0.55 is below 0.70.',
      'AI: The joke could be read as a threat.',
      'AI made 1 finding with no verifiable quote or explanation (removed).',
      "Rules matched HAR-1 by keyword or pattern, but the AI, reading the context, did not confirm it; the rule's default action is not applied.",
      'Rules and AI disagree: rules found PII-1, the AI did not.',
      'High severity finding (THR-1).',
      'The content contains instructions aimed at the AI; they were treated as content.',
      'Reported by 2 users.',
    ]);
    expect(ranked).toEqual([
      'Reported by 2 users.',
      'The content contains instructions aimed at the AI; they were treated as content.',
      'High severity finding (THR-1).',
      'Rules and AI disagree: rules found PII-1, the AI did not.',
      "Rules matched HAR-1 by keyword or pattern, but the AI, reading the context, did not confirm it; the rule's default action is not applied.",
      'AI made 1 finding with no verifiable quote or explanation (removed).',
      'AI: The joke could be read as a threat.',
      'AI confidence 0.55 is below 0.70.',
      'AI: not enough context to judge this content.',
      'AI result missing: AI did not answer in time - retry later. Rule findings only.',
      GENERIC,
    ]);
  });

  it('[AI-6] keeps the order within a rank, and puts an unknown reason before "AI unavailable" and the generic one', () => {
    expect(
      rankReasons([
        'Clause THR-1 always goes to a human.',
        'High severity finding (THR-1).',
        GENERIC,
        'Something new.',
      ]),
    ).toEqual(['Clause THR-1 always goes to a human.', 'High severity finding (THR-1).', 'Something new.', GENERIC]);
    expect(reasonRank('Something new.')).toBeLessThan(reasonRank('AI result missing: x. Rule findings only.'));
    expect(rankReasons([])).toEqual([]);
  });

  it('[AI-6] knows every reason combine() writes, and the ranked list ends with the generic reason', () => {
    const rec = combine({
      policy: POLICY,
      ruleFindings: [rule('PII-1')],
      ai: aiOk(
        {
          findings: [
            {
              clauseCode: 'HAR-1',
              evidenceType: 'confirmed',
              quotes: [{ text: 'idiot', start: 10, end: 15 }],
              interpretation: 'Insult.',
              severity: 'high',
              severityReason: 'r',
              confidence: 0.6,
              confidenceReason: 'r',
            },
          ],
          proposedAction: 'label',
          overallConfidence: 0.55,
          needsHumanReview: true,
          humanReviewReasons: ['The tone is ambiguous.'],
          insufficientContext: true,
        },
        {
          injectionSignals: ['override_instructions'],
          verification: {
            invalidCitations: ['HAR-9'],
            unverifiedQuotes: ['never said'],
            droppedFindings: 1,
            actionLowered: null,
          },
        },
      ),
      reportCount: 2,
      settings: SETTINGS,
    });
    expect(rec.reasons.length).toBeGreaterThan(8);
    for (const reason of rec.reasons) expect(reasonRank(reason), reason).not.toBe(10);
    const ranked = rankReasons(rec.reasons);
    expect(ranked[0]).toBe('Reported by 2 users.');
    expect(ranked.at(-1)).toMatch(/^The recommended action is /);
    const ranks = ranked.map(reasonRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
