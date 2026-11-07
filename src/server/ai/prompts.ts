import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuleFinding } from '../moderation/combine';
import type { ModAction, PolicyView } from './types';

// Prompt files and the user message (docs/02-system-design.md sec. 5.2, AI-8). Untrusted text is escaped so it
// can never close or open a tag: content is data, never instructions.

export interface LoadedPrompt {
  name: string;
  /** For example "classify.v1"; stored on every AiRun with the hash. */
  version: string;
  sha256: string;
  text: string;
}

const promptCache = new Map<string, LoadedPrompt>();

/** Reads prompts/<name>.v<version>.md. The hash is taken over LF line endings so it is stable across checkouts. */
export function loadPrompt(name: string, version: number, rootDir: string = process.cwd()): LoadedPrompt {
  const id = `${name}.v${version}`;
  const key = `${rootDir}|${id}`;
  const hit = promptCache.get(key);
  if (hit) return hit;
  const text = readFileSync(join(rootDir, 'prompts', `${id}.md`), 'utf8').replace(/\r\n/g, '\n');
  const loaded: LoadedPrompt = {
    name,
    version: id,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    text,
  };
  promptCache.set(key, loaded);
  return loaded;
}

export function escapeForPrompt(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** For attribute values: also escapes the double quote, so a value can never close its attribute. */
export function escapeAttr(text: string): string {
  return escapeForPrompt(text).replace(/"/g, '&quot;');
}

/** Reverses escapeForPrompt, for quotes the model copied from the escaped content. */
export function unescapeFromPrompt(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** The context the classify prompt is built from. Content and parent are raw text; escaping happens here. */
export interface ClassifyContext {
  content: { id: string; type: 'post' | 'comment'; text: string };
  parentText: string | null;
  /** Report reason -> count. Report notes are never sent (reasons and counts only). */
  reportReasons: Record<string, number>;
  ruleFindings: readonly RuleFinding[];
  /** Final actions on the author's earlier content, newest first. */
  authorHistory: readonly ModAction[];
}

/** A part of the optional context that the budget dropped or shortened. */
export type TrimmedPart = 'author_history' | 'parent_post' | 'reports';

const OMITTED = '(trimmed)';

function section(tag: string, body: string, attrs = ''): string {
  return `<${tag}${attrs}>\n${body}\n</${tag}>`;
}

export function buildClassifyUserMessage(
  policy: PolicyView,
  ctx: ClassifyContext,
  omitted: ReadonlySet<TrimmedPart> = new Set(),
): string {
  const clauses = policy.clauses
    .map((c) =>
      section(
        'clause',
        `<title>${escapeForPrompt(c.title)}</title>\n<text>${escapeForPrompt(c.text)}</text>`,
        ` code="${escapeAttr(c.code)}" default_severity="${c.defaultSeverity}" default_action="${c.defaultAction}"` +
          ` allowed_actions="${c.allowedActions.join(' ')}" always_escalate="${c.alwaysEscalate}"`,
      ),
    )
    .join('\n');

  const reportEntries = Object.entries(ctx.reportReasons).filter(([, n]) => n > 0);
  const reports = omitted.has('reports')
    ? OMITTED
    : reportEntries.length === 0
      ? 'none'
      : reportEntries.map(([reason, n]) => `${escapeForPrompt(reason.slice(0, 40))}: ${n}`).join('\n');

  const rules =
    ctx.ruleFindings.length === 0
      ? 'none'
      : ctx.ruleFindings
          .map(
            (f) =>
              `${escapeForPrompt(f.clauseCode)} (rule ${escapeForPrompt(f.ruleId)}): ` +
              f.quotes.map((q) => `"${escapeForPrompt(q.text)}"`).join(', '),
          )
          .join('\n');

  const parent = omitted.has('parent_post')
    ? OMITTED
    : ctx.parentText === null
      ? 'none'
      : escapeForPrompt(ctx.parentText);

  const history = omitted.has('author_history')
    ? OMITTED
    : ctx.authorHistory.length === 0
      ? 'none'
      : ctx.authorHistory.join(', ');

  return [
    section('policy', clauses, ` version="${policy.version}"`),
    section(
      'content',
      escapeForPrompt(ctx.content.text),
      ` type="${ctx.content.type}" id="${escapeAttr(ctx.content.id)}"`,
    ),
    section('parent_post', parent),
    section('reports', reports),
    section('rule_findings', rules),
    section('author_history', history),
    'Classify the text inside <content> against the policy above. Return only the JSON object.',
  ].join('\n\n');
}

// AI-8: phrases that address the model rather than readers. A hit never changes the classification; it only adds a
// "needs human" reason, so a false positive costs a human glance and a miss is still covered by the other reasons.
const INJECTION_SIGNALS: ReadonlyArray<{ name: string; re: RegExp }> = [
  {
    name: 'override_instructions',
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.!?\n]{0,40}\b(rules?|instructions?|polic(y|ies)|guidelines?|prompts?)\b/i,
  },
  { name: 'role_change', re: /\b(you are now|act as|pretend to be|new instructions|system prompt|developer mode)\b/i },
  {
    name: 'verdict_request',
    re: /\b(mark|classify|rate|label|flag|treat)\b[^.!?\n]{0,30}\b(as )?(safe|harmless|clean|approved|compliant|not (harmful|a violation))\b/i,
  },
  {
    name: 'addresses_moderator_ai',
    re: /\b(dear|attention|note to|hey)\b[^.!?\n]{0,20}\b(ai|model|assistant|moderator|classifier|bot)\b/i,
  },
  { name: 'output_format', re: /\b(needsHumanReview|proposedAction|insufficientContext|overallConfidence)\b/ },
  {
    name: 'tag_markup',
    re: /<\s*\/?\s*(content|policy|system|parent_post|reports|rule_findings|author_history|instructions?)\b/i,
  },
];

export function detectInjectionSignals(text: string): string[] {
  return INJECTION_SIGNALS.filter((signal) => signal.re.test(text)).map((signal) => signal.name);
}
