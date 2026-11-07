import { describe, expect, it } from 'vitest';
import { CONTENT_MAX_CHARS, PARENT_MAX_CHARS, estimateTokens, fitContext } from '@/server/ai/budget';
import { buildClassifyUserMessage, type TrimmedPart } from '@/server/ai/prompts';
import { POLICY, input } from './helpers/ai';

const SYSTEM = 'system prompt '.repeat(50);
const CONTENT = 'The actual post under review.';

const ctx = input(CONTENT, {
  parentText: 'P'.repeat(800),
  reportReasons: { harassment: 2, spam: 1, hate: 1, threat: 1, 'private-information': 1, other: 3 },
  authorHistory: ['label', 'none', 'limit', 'none', 'remove', 'label', 'label'],
});

function tokensWith(omitted: TrimmedPart[]): number {
  const bounded = { ...ctx, authorHistory: ctx.authorHistory.slice(0, 5) };
  return estimateTokens(SYSTEM) + estimateTokens(buildClassifyUserMessage(POLICY, bounded, new Set(omitted)));
}

describe('context budget', () => {
  it('[AI-11] tokens are estimated as characters / 4, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('[AI-11] a context within budget is sent whole, with the last 5 final actions only', () => {
    const result = fitContext(SYSTEM, POLICY, ctx, 100_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trimmedContext).toBe(false);
    expect(result.user).toContain('label, none, limit, none, remove\n');
    expect(result.user).toContain('harassment: 2');
  });

  it('[AI-11] over budget, the author history is trimmed first and the trim is recorded', () => {
    const limit = tokensWith(['author_history']);
    const result = fitContext(SYSTEM, POLICY, ctx, limit);
    expect(result).toMatchObject({ ok: true, trimmed: ['author_history'], trimmedContext: true });
    if (!result.ok) return;
    expect(result.user).toContain('P'.repeat(800));
    expect(result.user).toContain(CONTENT);
  });

  it('[AI-11] then the parent post, then the reports; the content is never trimmed', () => {
    const second = fitContext(SYSTEM, POLICY, ctx, tokensWith(['author_history', 'parent_post']));
    expect(second).toMatchObject({ ok: true, trimmed: ['author_history', 'parent_post'] });
    const third = fitContext(SYSTEM, POLICY, ctx, tokensWith(['author_history', 'parent_post', 'reports']));
    expect(third).toMatchObject({ ok: true, trimmed: ['author_history', 'parent_post', 'reports'] });
    if (!third.ok) return;
    expect(third.user).toContain(CONTENT);
    expect(third.user).not.toContain('PPPP');
    expect(third.user).not.toContain('harassment: 2');
  });

  it('[AI-11] still over budget after trimming: no prompt is produced', () => {
    const result = fitContext(SYSTEM, POLICY, ctx, tokensWith(['author_history', 'parent_post', 'reports']) - 1);
    expect(result).toMatchObject({ ok: false, reason: 'over_budget' });
  });

  it('[AI-11] a parent post longer than the ceiling is cut to it and flagged', () => {
    const long = input(CONTENT, { parentText: `${'a'.repeat(PARENT_MAX_CHARS)}TAIL` });
    const result = fitContext(SYSTEM, POLICY, long, 100_000);
    expect(result).toMatchObject({ ok: true, trimmed: ['parent_post'], trimmedContext: true });
    if (result.ok) expect(result.user).not.toContain('TAIL');
  });

  it('[AI-11] content over the content ceiling is refused, never trimmed', () => {
    const result = fitContext(SYSTEM, POLICY, input('x'.repeat(CONTENT_MAX_CHARS + 1)), 100_000);
    expect(result).toMatchObject({ ok: false, reason: 'content_too_long' });
  });
});
