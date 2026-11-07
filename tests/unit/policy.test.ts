import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
