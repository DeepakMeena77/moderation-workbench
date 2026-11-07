import type { AiFinding, ClassifyOutput } from './output';
import { unescapeFromPrompt } from './prompts';
import { ProviderError, type AiProvider, type GenerateJsonRequest, type GenerateJsonResponse } from './provider';
import { strongerAction, maxSeverity, type ModAction, type Severity } from './types';

// Deterministic mock provider (docs/02-system-design.md sec. 11). Keyword heuristics stand in for the model, and
// markers in the content force each failure path. It is deliberately naive about prompt injection: it behaves like a
// model that was fooled, so tests prove the server still routes such content to a human (AI-8).

export const MOCK_MARKERS = [
  'timeout',
  '429',
  '404',
  'fenced',
  'prose',
  'truncated',
  'invalid',
  'repair',
  'fakequote',
  'badclause',
  'disallowed',
] as const;
export type MockMarker = (typeof MOCK_MARKERS)[number];

/** Fake usage so the cost code is exercised: chars / 4, plus a fixed amount of "thinking". */
export const MOCK_THINKING_TOKENS = 24;

interface Heuristic {
  clauseCode: string;
  re: RegExp;
  severity: Severity;
  action: ModAction;
  confidence: number;
  interpretation: string;
}

const HAR_1: Heuristic = {
  clauseCode: 'HAR-1',
  re: /\b(worthless|idiot|stupid|moron|loser|pathetic)\b(\s+(idiot|moron|loser))?/i,
  severity: 'medium',
  action: 'label',
  confidence: 0.92,
  interpretation: 'A direct insult aimed at a person.',
};

const HEURISTICS: readonly Heuristic[] = [
  {
    clauseCode: 'THR-1',
    re: /\b(i will|i'll|gonna|going to)\s+(kill|hurt|shoot|stab|find)\s+you\b/i,
    severity: 'high',
    action: 'remove',
    confidence: 0.9,
    interpretation: 'States an intent to harm the reader.',
  },
  {
    clauseCode: 'SH-1',
    re: /\b(kill myself|hurt myself|end my life|want to die)\b/i,
    severity: 'high',
    action: 'limit',
    confidence: 0.85,
    interpretation: 'The author describes a risk of self-harm.',
  },
  HAR_1,
  {
    clauseCode: 'SCAM-1',
    re: /\b(double your money|send crypto|guaranteed returns)\b/i,
    severity: 'high',
    action: 'limit',
    confidence: 0.85,
    interpretation: 'Promotes a likely financial scam.',
  },
  {
    clauseCode: 'PII-1',
    re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b|\+?\d[\d -]{8,}\d/,
    severity: 'medium',
    action: 'limit',
    confidence: 0.8,
    interpretation: 'Shares contact details.',
  },
];

const LINK_RE = /https?:\/\/\S+/gi;

export function readMarkers(text: string): Set<MockMarker> {
  return new Set(MOCK_MARKERS.filter((m) => text.includes(`[mock:${m}]`)));
}

function extract(user: string): { content: string; clauses: Set<string> } {
  const content = /<content[^>]*>\n([\s\S]*?)\n<\/content>/.exec(user)?.[1] ?? '';
  const clauses = new Set([...user.matchAll(/<clause code="([^"]+)"/g)].map((m) => m[1] as string));
  return { content: unescapeFromPrompt(content), clauses };
}

function finding(h: Heuristic, quote: string): AiFinding {
  return {
    clauseCode: h.clauseCode,
    evidenceType: 'confirmed',
    quotes: [quote],
    interpretation: h.interpretation,
    severity: h.severity,
    severityReason: `Default severity for ${h.clauseCode}.`,
    confidence: h.confidence,
    confidenceReason: 'Explicit wording in the content.',
  };
}

export function mockClassify(content: string, clauses: Set<string>, markers: Set<MockMarker>): ClassifyOutput {
  const findings: AiFinding[] = [];
  let action: ModAction = 'none';
  for (const h of HEURISTICS) {
    if (!clauses.has(h.clauseCode)) continue;
    const match = h.re.exec(content);
    if (!match) continue;
    findings.push(finding(h, match[0]));
    action = strongerAction(action, h.action);
  }
  const links = content.match(LINK_RE) ?? [];
  if (clauses.has('SPAM-1') && links.length >= 3) {
    const spam: Heuristic = {
      clauseCode: 'SPAM-1',
      re: LINK_RE,
      severity: 'low',
      action: 'label',
      confidence: 0.8,
      interpretation: 'Floods the post with links.',
    };
    findings.push(finding(spam, links[0] as string));
    action = strongerAction(action, 'label');
  }

  if (markers.has('fakequote')) {
    const target = findings[0];
    if (target) target.quotes = ['this sentence is not in the content'];
    else
      findings.push({
        ...finding(HAR_1, 'this sentence is not in the content'),
        interpretation: 'The author insults the reader.',
        confidence: 0.95,
      });
    action = strongerAction(action, 'label');
  }
  if (markers.has('badclause')) {
    findings.push({
      ...finding(HAR_1, content.slice(0, 20) || 'x'),
      clauseCode: 'XYZ-9',
      interpretation: 'Cites a clause that does not exist.',
    });
  }
  if (markers.has('disallowed')) action = 'remove';

  const severity = maxSeverity(findings.map((f) => f.severity)) ?? 'low';
  return {
    findings,
    proposedAction: action,
    overallSeverity: severity,
    overallConfidence: findings.length === 0 ? 0.9 : Math.min(...findings.map((f) => f.confidence)),
    confidenceReason: findings.length === 0 ? 'No policy signal found.' : 'Based on the quoted wording.',
    needsHumanReview: findings.length > 0,
    humanReviewReasons: findings.length > 0 ? ['A policy clause may apply.'] : [],
    insufficientContext: false,
  };
}

// Valid JSON that breaks the contract in several places; it also carries keys the contract strips.
const INVALID_OUTPUT = JSON.stringify({
  findings: 'many',
  proposedAction: 'approve',
  overallConfidence: 7,
  decision: 'approved',
});

export interface MockProviderOptions {
  /** With [mock:404], every model except this one answers 404 (retired). */
  fallbackModel?: string | null;
}

export class MockProvider implements AiProvider {
  readonly name = 'mock';
  readonly requests: GenerateJsonRequest[] = [];

  constructor(private readonly options: MockProviderOptions = {}) {}

  async generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    this.requests.push(request);
    const { content, clauses } = extract(request.user);
    const markers = readMarkers(content);
    const isRepair = request.user.includes('<validation_errors>');

    // Never settles and ignores the abort signal: the pipeline's own timer must end the wait.
    if (markers.has('timeout')) return new Promise<never>(() => undefined);
    if (markers.has('429')) throw new ProviderError('rate_limited', 'Mock rate limit', { status: 429 });
    if (markers.has('404') && request.model !== this.options.fallbackModel) {
      throw new ProviderError('not_found', `Mock model ${request.model} is retired`, { status: 404 });
    }

    const json = JSON.stringify(mockClassify(content, clauses, markers));
    let text = json;
    let finishReason = 'STOP';
    if (markers.has('invalid') || (markers.has('repair') && !isRepair)) text = INVALID_OUTPUT;
    else if (markers.has('truncated') && !isRepair) {
      // What a real flash model returned when thinking used up the output budget.
      text = '{"';
      finishReason = 'MAX_TOKENS';
    } else if (markers.has('fenced')) text = `\`\`\`json\n${json}\n\`\`\``;
    else if (markers.has('prose')) text = `Here is my analysis of the post:\n${json}\nLet me know if you need more.`;

    return {
      text,
      usage: {
        input: Math.ceil((request.system.length + request.user.length) / 4),
        output: Math.ceil(text.length / 4),
        thinking: MOCK_THINKING_TOKENS,
      },
      model: request.model,
      finishReason,
    };
  }
}
