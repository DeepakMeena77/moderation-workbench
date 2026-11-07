import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiFindingSchema, classifyOutputSchema, classifyResponseJsonSchema } from '@/server/ai/output';
import { CLEAN_JSON } from './helpers/ai';

const DECIDING_KEY = /approv|decid|decision|status|outcome|visib|resolv|verdict/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

describe('AI output contract', () => {
  it('[HUM-1] the contract has no field that can approve, decide, resolve or set visibility', () => {
    const keys = [...Object.keys(classifyOutputSchema.shape), ...Object.keys(aiFindingSchema.shape)];
    expect(keys.filter((key) => DECIDING_KEY.test(key))).toEqual([]);
  });

  it('[HUM-1] unknown keys from the model are stripped', () => {
    const raw = {
      ...JSON.parse(CLEAN_JSON),
      decision: 'approve',
      status: 'resolved',
      visibility: 'removed',
      findings: [
        {
          clauseCode: 'HAR-1',
          evidenceType: 'confirmed',
          quotes: ['x'],
          interpretation: '',
          severity: 'low',
          severityReason: 'r',
          confidence: 0.5,
          confidenceReason: 'r',
          approve: true,
        },
      ],
    };
    const parsed = classifyOutputSchema.parse(raw);
    expect(parsed).not.toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('visibility');
    expect(parsed.findings[0]).not.toHaveProperty('approve');
  });

  it('[AI-9] the JSON schema sent to Gemini lists exactly the Zod contract fields, all required', () => {
    const top = classifyResponseJsonSchema as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(top.properties).sort()).toEqual(Object.keys(classifyOutputSchema.shape).sort());
    expect([...top.required].sort()).toEqual(Object.keys(classifyOutputSchema.shape).sort());
    const items = (top.properties.findings as { items: { properties: Record<string, unknown>; required: string[] } })
      .items;
    expect(Object.keys(items.properties).sort()).toEqual(Object.keys(aiFindingSchema.shape).sort());
    expect([...items.required].sort()).toEqual(Object.keys(aiFindingSchema.shape).sort());
  });

  it('[AI-5] each finding needs a severity reason and a confidence reason, and the result a confidence reason', () => {
    const clean = JSON.parse(CLEAN_JSON) as Record<string, unknown>;
    const f = {
      clauseCode: 'HAR-1',
      evidenceType: 'confirmed',
      quotes: ['x'],
      interpretation: '',
      severity: 'low',
      severityReason: ' ',
      confidence: 0.5,
    };
    const result = classifyOutputSchema.safeParse({ ...clean, confidenceReason: '', findings: [f] });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['confidenceReason', 'findings.0.severityReason', 'findings.0.confidenceReason']),
    );
  });

  it('[AI-9] limits are enforced: at most 8 findings, 3 quotes, confidence in [0, 1]', () => {
    const clean = JSON.parse(CLEAN_JSON) as Record<string, unknown>;
    const f = {
      clauseCode: 'HAR-1',
      evidenceType: 'confirmed',
      quotes: ['a', 'b', 'c', 'd'],
      interpretation: '',
      severity: 'low',
      severityReason: 'r',
      confidence: 1.2,
      confidenceReason: 'r',
    };
    const result = classifyOutputSchema.safeParse({ ...clean, findings: Array(9).fill(f) });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('findings');
    expect(paths).toContain('findings.0.quotes');
    expect(paths).toContain('findings.0.confidence');
  });

  it('[HUM-1] AI and moderation code never imports the visibility, decision or appeal services', () => {
    const files = [...sourceFiles(join('src', 'server', 'ai')), ...sourceFiles(join('src', 'server', 'moderation'))];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((file) =>
      /from\s+['"][^'"]*services\/(visibility|decisions|appeals)['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
