import { POLICY_REGEX_FLAGS } from '../policy/schema';
import type { Rule, RuleFinding } from './index';
import { finding, matchQuotes } from './index';

// DET-1: each clause regex, compiled with the same flags the policy schema validated it with.
export const patternRule: Rule = (text, policy) => {
  const findings: RuleFinding[] = [];
  for (const clause of policy.clauses) {
    const patterns = clause.signals.patterns ?? [];
    const quotes = patterns.flatMap((source) => matchQuotes(text, new RegExp(source, POLICY_REGEX_FLAGS)));
    if (quotes.length > 0)
      findings.push(
        finding(
          'pattern',
          clause,
          quotes.sort((a, b) => a.start - b.start),
        ),
      );
  }
  return findings;
};
