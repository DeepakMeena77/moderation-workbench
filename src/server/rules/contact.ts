import { POLICY_REGEX_FLAGS } from '../policy/schema';
import type { Quote, Rule, RuleFinding } from './index';
import { finding, matchQuotes } from './index';

// DET-3: contact details. Clauses with `contactDetails: true` are hit by an email address or a phone number
// of at least 9 digits; clauses with an `addressPattern` (v2 PII-1) also by a street address.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// Digits with the separators people type in phone numbers; the digit count is checked separately.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;
export const MIN_PHONE_DIGITS = 9;

export function findContactDetails(text: string): Quote[] {
  const emails = matchQuotes(text, new RegExp(EMAIL.source, EMAIL.flags));
  const phones = matchQuotes(text, new RegExp(PHONE_CANDIDATE.source, PHONE_CANDIDATE.flags)).filter(
    (quote) => quote.text.replace(/\D/g, '').length >= MIN_PHONE_DIGITS,
  );
  return [...emails, ...phones].sort((a, b) => a.start - b.start);
}

export const contactRule: Rule = (text, policy) => {
  const findings: RuleFinding[] = [];
  const contacts = findContactDetails(text);
  for (const clause of policy.clauses) {
    const quotes: Quote[] = clause.signals.contactDetails ? [...contacts] : [];
    if (clause.signals.addressPattern) {
      quotes.push(...matchQuotes(text, new RegExp(clause.signals.addressPattern, POLICY_REGEX_FLAGS)));
    }
    if (quotes.length > 0)
      findings.push(
        finding(
          'contact',
          clause,
          quotes.sort((a, b) => a.start - b.start),
        ),
      );
  }
  return findings;
};
