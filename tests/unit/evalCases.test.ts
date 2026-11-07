import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { policyFileSchema } from '@/server/policy/schema';

// The labelled evaluation set and its runner (docs/05-test-plan.md sec. 8, EVAL-1, EVAL-2). The quality numbers
// of a live run are reported, not asserted; these tests pin the set's coverage and that the runner works.

interface EvalCase {
  id: string;
  label: string;
  policyVersion: 1 | 2;
  parent?: string;
  text: string;
  expect: {
    clean?: boolean;
    mustInclude?: string[];
    mustNotInclude?: string[];
    mustNotConfirm?: string[];
    actionIn?: string[];
    mustEscalate?: boolean;
  };
}

const raw = readFileSync('evals/cases.json', 'utf8');
const cases = (JSON.parse(raw) as { cases: EvalCase[] }).cases;
const clauseCodes = (version: 1 | 2) =>
  new Set(
    policyFileSchema
      .parse(JSON.parse(readFileSync(`policies/policy.v${version}.json`, 'utf8')))
      .clauses.map((c) => c.code),
  );

describe('evaluation set (EVAL-1)', () => {
  it('[EVAL-1] holds about 20 cases with unique IDs, in an ASCII file', () => {
    expect(cases.length).toBeGreaterThanOrEqual(18);
    expect(cases.length).toBeLessThanOrEqual(25);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(/^[\x00-\x7f]*$/.test(raw)).toBe(true);
  });

  it('[EVAL-1] every expected clause exists in the policy version the case runs under', () => {
    for (const c of cases) {
      const known = clauseCodes(c.policyVersion);
      for (const code of [
        ...(c.expect.mustInclude ?? []),
        ...(c.expect.mustNotInclude ?? []),
        ...(c.expect.mustNotConfirm ?? []),
      ]) {
        expect(known.has(code), `${c.id} names ${code}`).toBe(true);
      }
    }
  });

  it('[EVAL-1] covers clean, violations, borderline, missing context, out of scope, injection and v2-only cases', () => {
    const has = (pattern: RegExp) => cases.some((c) => pattern.test(c.label));
    expect(cases.some((c) => c.expect.clean)).toBe(true);
    expect(cases.filter((c) => (c.expect.mustInclude ?? []).length > 0).length).toBeGreaterThanOrEqual(5);
    expect(has(/news|quot/)).toBe(true);
    expect(has(/sarcasm/)).toBe(true);
    expect(cases.some((c) => c.parent !== undefined)).toBe(true);
    expect(has(/outside the supported language/)).toBe(true);
    expect(has(/injection/)).toBe(true);
    const v2Only = cases.filter(
      (c) => c.policyVersion === 2 && (c.expect.mustInclude ?? []).some((code) => !clauseCodes(1).has(code)),
    );
    expect(v2Only.length).toBeGreaterThan(0);
  });
});

describe('evaluation runner (EVAL-2)', () => {
  it('[EVAL-2] npm run eval -- --mock runs every case through the pipeline and reports the metrics', () => {
    const run = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'evals/run.ts', '--mock'], {
      encoding: 'utf8',
      timeout: 60_000,
      // The mock run reads no .env; a quiet log keeps the output to the report.
      env: { ...process.env, LOG_LEVEL: 'silent' },
    });
    expect(run.status, run.stderr).toBe(0);
    const out = run.stdout;
    for (const metric of [
      'Clause precision, labelled codes',
      'Clause precision, strict (every unexpected citation is a false positive)',
      'Clause recall',
      'Exact action agreement',
      'Action in expected set',
      'Must-escalate recall (target 100%)',
      'Invalid-output rate',
      'Latency p50 / p90 (ms)',
      'Estimated cost (USD)',
    ]) {
      expect(out).toContain(`| ${metric} |`);
    }
    expect(out).toContain(`| Cases passed | `);
    for (const c of cases) expect(out).toContain(`| ${c.id} |`);
  }, 90_000);
});
