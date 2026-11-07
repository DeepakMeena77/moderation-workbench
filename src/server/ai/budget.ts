import { buildClassifyUserMessage, type ClassifyContext, type TrimmedPart } from './prompts';
import type { PolicyView } from './types';

// Context ceiling (docs/02-system-design.md sec. 5.3, AI-11). Tokens are estimated as characters / 4. The content
// and the policy are never trimmed; optional context goes in this order: author history, parent post, reports.
// If the prompt still does not fit, no call is made.

export const CONTENT_MAX_CHARS = 2_000;
export const PARENT_MAX_CHARS = 1_000;
export const HISTORY_MAX_ITEMS = 5;

const TRIM_ORDER: readonly TrimmedPart[] = ['author_history', 'parent_post', 'reports'];

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type BudgetResult =
  | { ok: true; user: string; estimatedTokens: number; trimmed: TrimmedPart[]; trimmedContext: boolean }
  | { ok: false; reason: 'content_too_long' | 'over_budget'; estimatedTokens: number; trimmed: TrimmedPart[] };

export function fitContext(
  system: string,
  policy: PolicyView,
  ctx: ClassifyContext,
  maxInputTokens: number,
): BudgetResult {
  const trimmed: TrimmedPart[] = [];
  if (ctx.content.text.length > CONTENT_MAX_CHARS) {
    return {
      ok: false,
      reason: 'content_too_long',
      estimatedTokens: estimateTokens(system + ctx.content.text),
      trimmed,
    };
  }

  // Fixed ceilings first: the parent post is cut to its limit and only the last five final actions are sent.
  let parentText = ctx.parentText;
  if (parentText !== null && parentText.length > PARENT_MAX_CHARS) {
    parentText = parentText.slice(0, PARENT_MAX_CHARS);
    trimmed.push('parent_post');
  }
  const bounded: ClassifyContext = {
    ...ctx,
    parentText,
    authorHistory: ctx.authorHistory.slice(0, HISTORY_MAX_ITEMS),
  };

  const omitted = new Set<TrimmedPart>();
  let user = buildClassifyUserMessage(policy, bounded, omitted);
  let estimate = estimateTokens(system) + estimateTokens(user);

  for (const part of TRIM_ORDER) {
    if (estimate <= maxInputTokens) break;
    omitted.add(part);
    if (!trimmed.includes(part)) trimmed.push(part);
    user = buildClassifyUserMessage(policy, bounded, omitted);
    estimate = estimateTokens(system) + estimateTokens(user);
  }

  if (estimate > maxInputTokens) return { ok: false, reason: 'over_budget', estimatedTokens: estimate, trimmed };
  return { ok: true, user, estimatedTokens: estimate, trimmed, trimmedContext: trimmed.length > 0 };
}
