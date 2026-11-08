import { describe, expect, it } from 'vitest';
import { auditSummary, shortId } from '@/ui/features/audit/auditSummary';

// The audit page's one-line summaries (AUD-5): the main facts of each event without expanding the row.

describe('audit summary', () => {
  it('[AUD-5] visibility changes read as before -> after', () => {
    expect(
      auditSummary({
        action: 'visibility.changed',
        before: { visibility: 'visible' },
        after: { visibility: 'limited' },
      }),
    ).toBe('visible -> limited');
  });

  it('[AUD-5] decisions name the kind, the final action and the clauses', () => {
    expect(
      auditSummary({
        action: 'decision.created',
        before: null,
        after: { kind: 'modify', finalAction: 'limit', clauseCodes: ['HAR-1'], caseId: 'x' },
      }),
    ).toBe('modify, final action limit, HAR-1');
  });

  it('[AUD-5] analyses name the recommendation, priority, auto-clear and a failed AI', () => {
    expect(
      auditSummary({
        action: 'analysis.created',
        before: null,
        after: { action: 'none', priority: 20, autoClear: true, aiStatus: 'ok' },
      }),
    ).toBe('recommends none, priority 20, auto-cleared');
    expect(
      auditSummary({
        action: 'analysis.created',
        before: null,
        after: { action: 'label', priority: 55, aiStatus: 'invalid_output' },
      }),
    ).toBe('recommends label, priority 55, AI invalid output');
  });

  it('[AUD-5] reports, appeals and refused access read as words', () => {
    expect(
      auditSummary({ action: 'report.created', before: null, after: { reason: 'private_info', hasNote: true } }),
    ).toBe('reason: private info, with a note');
    expect(
      auditSummary({ action: 'appeal.resolved', before: null, after: { outcome: 'overturn', finalAction: 'none' } }),
    ).toBe('overturn, final action none');
    expect(
      auditSummary({
        action: 'access.denied',
        before: null,
        after: { method: 'POST', code: 'SAME_REVIEWER', role: 'senior_moderator' },
      }),
    ).toBe('POST, SAME REVIEWER, as senior moderator');
  });

  it('[AUD-5] an unknown event shows up to two plain fields and never an id', () => {
    expect(
      auditSummary({
        action: 'job.retried',
        before: null,
        after: { jobId: 'abc', type: 'analyze', attempts: 2, x: 1 },
      }),
    ).toBe('type analyze, attempts 2');
    expect(auditSummary({ action: 'job.failed', before: null, after: null })).toBe('');
  });

  it('[AUD-5] long ids are shortened to their last 7 characters, short ones are kept', () => {
    expect(shortId('cmw737i1w0003jz08r5tyqti7')).toBe('5tyqti7');
    expect(shortId('HAR-1')).toBe('HAR-1');
  });
});
