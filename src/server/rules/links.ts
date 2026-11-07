import type { Rule, RuleFinding } from './index';
import { finding, matchQuotes } from './index';

// DET-2: link flooding. A link is an http(s) URL or a www. address; trailing sentence punctuation is not part
// of it. At or above a clause's linkThreshold (v1: 3, v2: 2) the clause is hit, quoting every link.

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

export function findLinks(text: string) {
  return matchQuotes(text, new RegExp(LINK.source, LINK.flags));
}

export const linksRule: Rule = (text, policy) => {
  const findings: RuleFinding[] = [];
  const links = findLinks(text);
  for (const clause of policy.clauses) {
    const threshold = clause.signals.linkThreshold;
    if (threshold !== undefined && links.length >= threshold) findings.push(finding('links', clause, links));
  }
  return findings;
};
