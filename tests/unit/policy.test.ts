import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isEmptyDiff, policyChangeSince, policyDiff } from '@/server/policy/diff';
import { canonicalJson, policyContentHash, policyFileSchema } from '@/server/policy/schema';

// POL-1: policy files are validated against a Zod schema; validation errors carry their JSON paths.

const raw = (version: 1 | 2): unknown => JSON.parse(readFileSync(`policies/policy.v${version}.json`, 'utf8'));
const parse = (version: 1 | 2) => policyFileSchema.parse(raw(version));

describe('policy files', () => {
  it('[POL-1] policy v1 has the six clauses of 02 sec. 4 with their severities, actions and flags', () => {
    const v1 = parse(1);
    expect(v1.version).toBe(1);
    expect(
      v1.clauses.map((c) => [c.code, c.defaultSeverity, c.defaultAction, c.allowedActions.join('|'), c.alwaysEscalate]),
    ).toEqual([
      ['HAR-1', 'medium', 'label', 'label|limit|remove', false],
      ['THR-1', 'high', 'remove', 'limit|remove', true],
      ['HATE-1', 'high', 'remove', 'label|limit|remove', false],
      ['SH-1', 'high', 'limit', 'label|limit', true],
      ['PII-1', 'medium', 'limit', 'limit|remove', false],
      ['SPAM-1', 'low', 'label', 'label|limit|remove', false],
    ]);
    expect(v1.clauses[0]?.signals).toEqual({ keywords: ['worthless', 'idiot'], patterns: ['\\bkill yourself\\b'] });
    expect(v1.clauses.find((c) => c.code === 'SPAM-1')?.signals.linkThreshold).toBe(3);
    expect(v1.clauses.find((c) => c.code === 'PII-1')?.signals.contactDetails).toBe(true);
  });

  it('[POL-1] policy v2 adds SCAM-1, a PII-1 address pattern and a SPAM-1 threshold of 2', () => {
    const v1 = parse(1);
    const v2 = parse(2);
    expect(v2.clauses.map((c) => c.code)).toEqual([...v1.clauses.map((c) => c.code), 'SCAM-1']);
    expect(v2.clauses.find((c) => c.code === 'SCAM-1')).toMatchObject({
      defaultSeverity: 'high',
      allowedActions: ['limit', 'remove'],
    });
    expect(v2.clauses.find((c) => c.code === 'PII-1')?.signals.addressPattern).toBeTruthy();
    expect(v2.clauses.find((c) => c.code === 'SPAM-1')?.signals.linkThreshold).toBe(2);
    expect(policyContentHash(v2.clauses)).not.toBe(policyContentHash(v1.clauses));
  });

  it('[POL-1] errors name the path: unknown keys, a default action that is not allowed, a bad regex, duplicates', () => {
    const policy = raw(1) as { clauses: Array<Record<string, unknown>> };
    const broken = structuredClone(policy);
    broken.clauses[0]!.keyword = ['typo'];
    broken.clauses[1]!.defaultAction = 'label';
    broken.clauses[2]!.signals = { patterns: ['(unclosed'] };
    broken.clauses[3]!.code = 'HAR-1';
    const result = policyFileSchema.safeParse(broken);
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^clauses\.0: Unrecognized key/),
        'clauses.1.defaultAction: defaultAction must be one of allowedActions.',
        'clauses.2.signals.patterns.0: Not a valid regular expression.',
        'clauses.3.code: Duplicate clause code HAR-1.',
      ]),
    );
  });

  it('[POL-1] the content hash ignores key order and the version number', () => {
    const v1 = parse(1);
    const reordered = v1.clauses.map((c) => Object.fromEntries(Object.entries(c).reverse())) as typeof v1.clauses;
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(policyContentHash(reordered)).toBe(policyContentHash(v1.clauses));
  });
});

// POL-5: policyDiff(a, b) lists clauses added, removed and changed, field by field (02 sec. 4).

describe('policyDiff', () => {
  it('[POL-5] v1 -> v2: SCAM-1 added, SPAM-1 and PII-1 changed at field level, the rest unchanged', () => {
    const diff = policyDiff(parse(1).clauses, parse(2).clauses);
    expect(diff.added.map((c) => c.code)).toEqual(['SCAM-1']);
    expect(diff.removed).toEqual([]);
    expect(diff.unchanged).toEqual(['HAR-1', 'THR-1', 'HATE-1', 'SH-1']);
    const spam = diff.changed.find((c) => c.code === 'SPAM-1');
    expect(spam?.changes).toEqual([
      { field: 'signals.linkThreshold', before: 3, after: 2 },
      { field: 'text', before: expect.any(String), after: expect.stringContaining('Two or more links') },
      { field: 'title', before: 'Spam and link flooding (3+ links)', after: 'Spam and link flooding (2+ links)' },
    ]);
    const pii = diff.changed.find((c) => c.code === 'PII-1');
    expect(pii?.changes).toContainEqual({ field: 'signals.addressPattern', before: null, after: expect.any(String) });
  });

  it('[POL-5] the reverse direction reports the clause as removed', () => {
    const diff = policyDiff(parse(2).clauses, parse(1).clauses);
    expect(diff.removed.map((c) => c.code)).toEqual(['SCAM-1']);
    expect(diff.added).toEqual([]);
  });

  it('[POL-5] identical clauses give an empty diff, whatever the key order', () => {
    const v1 = parse(1).clauses;
    const reordered = v1.map((c) => Object.fromEntries(Object.entries(c).reverse())) as typeof v1;
    const diff = policyDiff(v1, reordered);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.unchanged).toHaveLength(6);
  });

  it('[POL-5] array fields such as allowedActions are reported whole, before and after', () => {
    const [har] = parse(1).clauses;
    if (!har) throw new Error('v1 has no clauses');
    const changed = { ...har, allowedActions: ['label', 'limit'] as typeof har.allowedActions, alwaysEscalate: true };
    expect(policyDiff([har], [changed]).changed).toEqual([
      {
        code: 'HAR-1',
        title: har.title,
        changes: [
          { field: 'allowedActions', before: ['label', 'limit', 'remove'], after: ['label', 'limit'] },
          { field: 'alwaysEscalate', before: false, after: true },
        ],
      },
    ]);
  });
});

describe('policyChangeSince', () => {
  it('[POL-4] a decision under v1 shows "Policy changed since this decision (v1 -> v2)" once v2 is active', () => {
    expect(policyChangeSince(1, 2)).toEqual({
      fromVersion: 1,
      toVersion: 2,
      message: 'Policy changed since this decision (v1 -> v2)',
    });
    expect(policyChangeSince(2, 2)).toBeNull();
  });
});
