import type { ActivePolicy, Severity } from '../policy/schema';
import { contactRule } from './contact';
import { keywordRule } from './keyword';
import { linksRule } from './links';
import { patternRule } from './pattern';
import { repeatRule } from './repeat';

// Deterministic checks (docs/02-system-design.md sec. 5.1, DET-1..5): (text, policy, ctx) -> RuleFinding[].
// Pure functions. Every finding is confirmed evidence: exact quotes with offsets into the text, confidence 1.

export interface Quote {
  text: string;
  start: number;
  end: number;
}

export type RuleId = 'keyword' | 'pattern' | 'links' | 'contact' | 'repeat';

export interface RuleFinding {
  ruleId: RuleId;
  clauseCode: string;
  evidenceType: 'confirmed';
  quotes: Quote[];
  confidence: 1;
  severity: Severity;
}

export interface RecentItem {
  body: string;
  createdAt: Date;
}

export interface RuleContext {
  /** When the content was created; the repeat window is measured back from here. */
  createdAt: Date;
  /** The same author's earlier items (any type). The caller may pass more; the rule applies the window. */
  recentByAuthor: RecentItem[];
}

export type Rule = (text: string, policy: ActivePolicy, ctx: RuleContext) => RuleFinding[];

/** Bounds the stored JSON: a post of 2,000 characters cannot produce an unbounded quote list. */
export const MAX_QUOTES_PER_FINDING = 20;

export function runRules(text: string, policy: ActivePolicy, ctx: RuleContext): RuleFinding[] {
  // Listed inside the function: the rule modules import helpers from this file, so a module-level array
  // would read them before they are initialised when a test imports a single rule first.
  const rules: readonly Rule[] = [keywordRule, patternRule, linksRule, contactRule, repeatRule];
  return rules.flatMap((rule) => rule(text, policy, ctx));
}

/** Every match of `re` in `text` as quotes, skipping empty matches. `re` must have the g flag. */
export function matchQuotes(text: string, re: RegExp): Quote[] {
  const quotes: Quote[] = [];
  for (const match of text.matchAll(re)) {
    if (match[0].length === 0 || match.index === undefined) continue;
    quotes.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    if (quotes.length >= MAX_QUOTES_PER_FINDING) break;
  }
  return quotes;
}

export function finding(ruleId: RuleId, clause: { code: string; defaultSeverity: Severity }, quotes: Quote[]) {
  return {
    ruleId,
    clauseCode: clause.code,
    evidenceType: 'confirmed',
    quotes: quotes.slice(0, MAX_QUOTES_PER_FINDING),
    confidence: 1,
    severity: clause.defaultSeverity,
  } satisfies RuleFinding;
}
