import type { AiFinding, ClassifyOutput } from './output';
import { unescapeFromPrompt } from './prompts';
import { actionRank, type ModAction, type PolicyView, type QuoteSpan } from './types';

// Verify (docs/02-system-design.md sec. 5.5, AI-2..4). The model's output is a claim; this checks it against the
// policy version and the content before anyone sees it. Pure: the caller logs what was found.

export const UNVERIFIED_CONFIDENCE_CAP = 0.5;

export interface VerifiedFinding extends Omit<AiFinding, 'quotes'> {
  /** Quotes found in the content, with offsets into the original text. */
  quotes: QuoteSpan[];
}

export interface VerifiedOutput extends Omit<ClassifyOutput, 'findings'> {
  findings: VerifiedFinding[];
}

export interface VerificationReport {
  /** Clause codes the model cited that are not in this policy version (findings removed). */
  invalidCitations: string[];
  /** Clause codes of findings that had a quote not found in the content (moved to interpretation). */
  unverifiedQuotes: string[];
  /** Findings dropped because nothing verifiable was left. */
  droppedFindings: number;
  actionLowered: { from: ModAction; to: ModAction } | null;
}

export interface VerifyResult {
  output: VerifiedOutput;
  report: VerificationReport;
}

interface NormalisedText {
  text: string;
  /** For each character of `text`, its [start, end) range in the original. */
  spans: Array<[number, number]>;
}

/** Lower case, whitespace runs collapsed to one space, with a map back to the original offsets. */
function normalise(original: string): NormalisedText {
  let text = '';
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < original.length) {
    const cp = original.codePointAt(i) as number;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    if (/\s/.test(ch)) {
      let j = i + width;
      while (j < original.length && /\s/.test(original[j] as string)) j++;
      text += ' ';
      spans.push([i, j]);
      i = j;
      continue;
    }
    // Lower-casing can lengthen a character; every resulting unit maps back to the same original range.
    for (const unit of ch.toLowerCase()) {
      text += unit;
      for (let k = 0; k < unit.length; k++) spans.push([i, i + width]);
    }
    i += width;
  }
  return { text, spans };
}

export function findQuote(content: string, quote: string, normalisedContent = normalise(content)): QuoteSpan | null {
  const needle = normalise(unescapeFromPrompt(quote).trim()).text;
  if (needle === '') return null;
  const at = normalisedContent.text.indexOf(needle);
  if (at < 0) return null;
  const first = normalisedContent.spans[at];
  const last = normalisedContent.spans[at + needle.length - 1];
  if (!first || !last) return null;
  return { text: content.slice(first[0], last[1]), start: first[0], end: last[1] };
}

export function verifyOutput(output: ClassifyOutput, policy: PolicyView, content: string): VerifyResult {
  const clauses = new Map(policy.clauses.map((c) => [c.code, c]));
  const normalisedContent = normalise(content);
  const invalidCitations: string[] = [];
  const unverifiedQuotes: string[] = [];
  let droppedFindings = 0;
  let anyCapped = false;

  const findings: VerifiedFinding[] = [];
  for (const finding of output.findings) {
    // 1. A clause that is not in this policy version cannot be cited (AI-2).
    if (!clauses.has(finding.clauseCode)) {
      invalidCitations.push(finding.clauseCode);
      continue;
    }

    // 2. Every quote must be in the content (AI-3). Confirmed evidence needs at least one real quote.
    const found: QuoteSpan[] = [];
    let missing = 0;
    for (const quote of finding.quotes) {
      const span = findQuote(content, quote, normalisedContent);
      if (span) found.push(span);
      else missing++;
    }
    const unsupported = missing > 0 || (finding.evidenceType === 'confirmed' && found.length === 0);
    const verified: VerifiedFinding = { ...finding, quotes: found };
    if (unsupported) {
      unverifiedQuotes.push(finding.clauseCode);
      verified.evidenceType = 'interpretation';
      verified.confidence = Math.min(finding.confidence, UNVERIFIED_CONFIDENCE_CAP);
      anyCapped = true;
    }

    // 3. Nothing left to show a human: drop it.
    if (verified.quotes.length === 0 && verified.interpretation.trim() === '') {
      droppedFindings++;
      continue;
    }
    findings.push(verified);
  }

  // 4. The action may be lowered to what the remaining clauses allow, never raised (AI-4).
  const allowed = new Set<ModAction>(['none']);
  for (const f of findings) for (const a of clauses.get(f.clauseCode)?.allowedActions ?? []) allowed.add(a);
  const strongestAllowed = [...allowed].reduce((a, b) => (actionRank(a) >= actionRank(b) ? a : b));
  let proposedAction = output.proposedAction;
  let actionLowered: VerificationReport['actionLowered'] = null;
  if (actionRank(proposedAction) > actionRank(strongestAllowed)) {
    actionLowered = { from: proposedAction, to: strongestAllowed };
    proposedAction = strongestAllowed;
  }

  return {
    output: {
      ...output,
      findings,
      proposedAction,
      overallConfidence: anyCapped
        ? Math.min(output.overallConfidence, UNVERIFIED_CONFIDENCE_CAP)
        : output.overallConfidence,
    },
    report: { invalidCitations, unverifiedQuotes, droppedFindings, actionLowered },
  };
}
