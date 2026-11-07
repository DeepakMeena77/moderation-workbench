import type { Rule, RuleFinding } from './index';
import { finding, matchQuotes } from './index';

// DET-1: each clause keyword, case-insensitive, as a whole word. Letters and digits on either side mean it is
// part of a longer word ("idiotic" does not match "idiot"); the check is Unicode-aware.

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function keywordRegex(keyword: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(keyword)}(?![\\p{L}\\p{N}_])`, 'giu');
}

export const keywordRule: Rule = (text, policy) => {
  const findings: RuleFinding[] = [];
  for (const clause of policy.clauses) {
    const keywords = clause.signals.keywords ?? [];
    const quotes = keywords.flatMap((keyword) => matchQuotes(text, keywordRegex(keyword)));
    if (quotes.length > 0)
      findings.push(
        finding(
          'keyword',
          clause,
          quotes.sort((a, b) => a.start - b.start),
        ),
      );
  }
  return findings;
};
