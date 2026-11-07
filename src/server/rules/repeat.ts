import type { Rule, RuleFinding } from './index';
import { finding } from './index';

// DET-4: near-duplicate text from the same author within 10 minutes is a SPAM-1 finding. Overlap is the share
// of distinct words the two texts have in common, measured against the larger set, so a short text inside a
// long one does not count as a repeat.

export const REPEAT_WINDOW_MS = 10 * 60 * 1000;
export const REPEAT_MIN_OVERLAP = 0.9;
export const REPEAT_CLAUSE = 'SPAM-1';
// Two-word replies ("thanks a lot") repeat naturally; they are not flooding, so very short texts are skipped.
export const REPEAT_MIN_WORDS = 3;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
}

export function wordOverlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  const larger = Math.max(left.size, right.size);
  if (larger === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / larger;
}

export const repeatRule: Rule = (text, policy, ctx) => {
  const clause = policy.clauses.find((candidate) => candidate.code === REPEAT_CLAUSE);
  if (!clause || words(text).size < REPEAT_MIN_WORDS) return [];
  const since = ctx.createdAt.getTime() - REPEAT_WINDOW_MS;
  const repeated = ctx.recentByAuthor.some(
    (item) =>
      item.createdAt.getTime() >= since &&
      item.createdAt.getTime() <= ctx.createdAt.getTime() &&
      wordOverlap(text, item.body) >= REPEAT_MIN_OVERLAP,
  );
  if (!repeated) return [];
  const findings: RuleFinding[] = [finding('repeat', clause, [{ text, start: 0, end: text.length }])];
  return findings;
};
