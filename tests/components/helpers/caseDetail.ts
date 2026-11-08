import type { CaseDetail, Clause } from '@/ui/api/hooks';

// A case as GET /api/cases/:id returns it: awaiting review, a rule-only analysis (AI unavailable), policy v1.
// Shared by the case page and decision panel component tests.

export const CLAUSES: Clause[] = [
  {
    code: 'HAR-1',
    title: 'Harassment and insults',
    text: 'No insults.',
    defaultSeverity: 'medium',
    defaultAction: 'label',
    allowedActions: ['label', 'limit', 'remove'],
  },
  {
    code: 'PII-1',
    title: 'Private information',
    text: 'No private details.',
    defaultSeverity: 'medium',
    defaultAction: 'limit',
    allowedActions: ['limit', 'remove'],
  },
];

export function makeDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'case1',
    status: 'awaiting_review',
    trigger: 'new_content',
    entry: 'rules',
    priority: 55,
    reportCount: 0,
    createdAt: new Date().toISOString(),
    content: {
      id: 'c1',
      type: 'post',
      body: 'You are a worthless idiot',
      createdAt: new Date().toISOString(),
      visibility: 'visible',
      author: { id: 'u1', name: 'Asha Rao' },
      parent: null,
    },
    reportReasons: [],
    analysis: {
      id: 'a1',
      seq: 1,
      policyVersion: 1,
      reason: 'initial',
      createdAt: new Date().toISOString(),
      aiStatus: 'unavailable',
      recommendation: {
        action: 'label',
        severity: 'medium',
        confidence: null,
        needsHuman: true,
        reasons: ['AI review unavailable - rule findings only.'],
        autoClear: false,
        priority: 55,
        clauseCodes: ['HAR-1'],
      },
      ruleFindings: [
        {
          source: 'rule',
          ruleId: 'keyword',
          clauseCode: 'HAR-1',
          evidenceType: 'confirmed',
          quotes: [{ text: 'idiot', start: 20, end: 25 }],
          interpretation: null,
          severity: 'medium',
          severityReason: null,
          confidence: 1,
          confidenceReason: null,
        },
      ],
      ai: null,
      aiRun: null,
    },
    versions: [
      {
        id: 'a1',
        seq: 1,
        policyVersion: 1,
        reason: 'initial',
        aiStatus: 'unavailable',
        action: 'label',
        createdAt: '',
      },
    ],
    decision: null,
    analysisPending: false,
    policy: { version: 1, clauses: CLAUSES },
    permissions: { canDecide: true, canReanalyze: true, canReopen: false, readOnly: false },
    ...overrides,
  };
}
