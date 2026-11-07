import { z } from 'zod';
import { getLogger } from '../logger';
import type { AiConfig } from './aiConfig';
import type { AiRunRecord, AiRunSink, CallCounter } from './aiRun';
import { estimateTokens } from './budget';
import { buildRepairUserMessage, plainReason } from './classify';
import {
  buildRunRecord,
  PipelineStop,
  RunState,
  realClock,
  runStructured,
  sharedPacer,
  type AiLogger,
  type Clock,
  type Pacer,
  type PipelineDeps,
} from './pipeline';
import { escapeForPrompt, loadPrompt, type LoadedPrompt } from './prompts';
import type { AiProvider } from './provider';
import type { AiStatus, ModAction, PolicyView } from './types';

// The appeal brief (docs/02-system-design.md sec. 5.7, AI-12): a neutral summary for the senior moderator, the
// new points the appeal raises, and which original findings the author disputes. It runs through the same bounded
// pipeline as classify (budget -> provider chain -> parse ladder -> Zod -> at most one repair -> verify) and writes
// one AiRun. The output contract has NO outcome, recommendation, decision or status field, and z.object strips
// unknown keys, so a model that adds "recommendedOutcome" changes nothing downstream (02 sec. 12, ADR 10).
// "Policy changed since decision" is not asked of the model: the server reads it from the database.

export const APPEAL_BRIEF_PROMPT = { name: 'appeal-brief', version: 1 } as const;

export const MAX_NEW_POINTS = 5;
export const MAX_DISPUTED = 8;

const sentence = (max: number) => z.string().trim().min(1).max(max);

export const appealBriefOutputSchema = z.object({
  summary: sentence(600),
  newPoints: z.array(sentence(300)).max(MAX_NEW_POINTS),
  disputedFindings: z
    .array(z.object({ clauseCode: z.string().trim().min(1).max(32), authorClaim: sentence(300) }))
    .max(MAX_DISPUTED),
});

export type AppealBrief = z.infer<typeof appealBriefOutputSchema>;

const str = (maxLength: number) => ({ type: 'string', maxLength });

/** The same contract as JSON Schema for Gemini JSON mode; a unit test keeps the keys in step with the Zod schema. */
export const appealBriefResponseJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: str(600),
    newPoints: { type: 'array', maxItems: MAX_NEW_POINTS, items: str(300) },
    disputedFindings: {
      type: 'array',
      maxItems: MAX_DISPUTED,
      items: {
        type: 'object',
        properties: { clauseCode: str(32), authorClaim: str(300) },
        required: ['clauseCode', 'authorClaim'],
      },
    },
  },
  required: ['summary', 'newPoints', 'disputedFindings'],
};

/** One original finding as the brief sees it: the clause, where it came from, and its evidence as plain text. */
export interface BriefFinding {
  clauseCode: string;
  source: 'rule' | 'ai';
  evidenceType: 'confirmed' | 'interpretation';
  quotes: string[];
  interpretation: string | null;
}

export interface AppealBriefInput {
  /** The policy version the decision was made under; only the cited clauses go into the prompt. */
  policy: PolicyView;
  content: { type: 'post' | 'comment'; text: string };
  findings: readonly BriefFinding[];
  decision: {
    kind: 'approve' | 'reject' | 'modify';
    finalAction: ModAction;
    clauseCodes: readonly string[];
    reasonCategory: string | null;
    rationale: string | null;
  };
  appeal: { statement: string; evidenceLinks: readonly string[]; evidenceNote: string | null };
}

export interface AppealBriefDeps {
  provider: AiProvider;
  config: AiConfig;
  sink: AiRunSink;
  callCounter: CallCounter;
  clock?: Clock;
  pacer?: Pacer;
  logger?: AiLogger;
  requestId?: string | null;
  prompt?: LoadedPrompt;
}

export interface AppealBriefResult {
  status: AiStatus;
  /** Verified brief; null unless status is ok. */
  brief: AppealBrief | null;
  /** Disputed clause codes removed because they are not among the original findings or decision clauses. */
  droppedClauses: string[];
  unavailableReason: string | null;
  aiRunId: string;
  aiRun: AiRunRecord;
}

function section(tag: string, body: string, attrs = ''): string {
  return `<${tag}${attrs}>\n${body}\n</${tag}>`;
}

/** Clause codes the brief may cite: those of the original findings and of the decision. */
export function citableClauses(input: Pick<AppealBriefInput, 'findings' | 'decision'>): Set<string> {
  return new Set([...input.findings.map((f) => f.clauseCode), ...input.decision.clauseCodes]);
}

/** The user message (AI-8): every untrusted string is escaped, so the appeal can never close or open a tag. */
export function buildAppealBriefUserMessage(input: AppealBriefInput): string {
  const citable = citableClauses(input);
  const clauses = input.policy.clauses
    .filter((c) => citable.has(c.code))
    .map((c) =>
      section(
        'clause',
        `<title>${escapeForPrompt(c.title)}</title>\n<text>${escapeForPrompt(c.text)}</text>`,
        ` code="${escapeForPrompt(c.code)}" allowed_actions="${c.allowedActions.join(' ')}"`,
      ),
    )
    .join('\n');

  const findings =
    input.findings.length === 0
      ? 'none'
      : input.findings
          .map((f) => {
            const quotes = f.quotes.map((q) => `<quote>${escapeForPrompt(q)}</quote>`).join('\n');
            const interpretation = f.interpretation
              ? `<interpretation>${escapeForPrompt(f.interpretation)}</interpretation>`
              : '';
            return section(
              'finding',
              [quotes, interpretation].filter(Boolean).join('\n') || 'no quote',
              ` clause="${escapeForPrompt(f.clauseCode)}" source="${f.source}" evidence="${f.evidenceType}"`,
            );
          })
          .join('\n');

  const d = input.decision;
  const decision = [
    `kind: ${d.kind}`,
    `final_action: ${d.finalAction}`,
    `clauses: ${d.clauseCodes.length > 0 ? d.clauseCodes.map(escapeForPrompt).join(', ') : 'none'}`,
    `reason_category: ${d.reasonCategory ? escapeForPrompt(d.reasonCategory) : 'none'}`,
    `moderator_note: ${d.rationale ? escapeForPrompt(d.rationale) : 'none'}`,
  ].join('\n');

  const links =
    input.appeal.evidenceLinks.length === 0
      ? 'none'
      : input.appeal.evidenceLinks.map((l) => escapeForPrompt(l)).join('\n');

  return [
    section('policy', clauses || 'none', ` version="${input.policy.version}"`),
    section('content', escapeForPrompt(input.content.text), ` type="${input.content.type}"`),
    section('original_findings', findings),
    section('decision', decision),
    section('appeal_statement', escapeForPrompt(input.appeal.statement)),
    section('evidence_links', links),
    section('evidence_note', input.appeal.evidenceNote ? escapeForPrompt(input.appeal.evidenceNote) : 'none'),
    'Write the neutral appeal brief for the data above. Return only the JSON object.',
  ].join('\n\n');
}

/** Verify step: a disputed finding must name a clause the original findings or decision actually cited. */
export function verifyBrief(
  brief: AppealBrief,
  input: Pick<AppealBriefInput, 'findings' | 'decision'>,
): { brief: AppealBrief; droppedClauses: string[] } {
  const citable = citableClauses(input);
  const droppedClauses: string[] = [];
  const disputedFindings = brief.disputedFindings.flatMap((d) => {
    const code = d.clauseCode.toUpperCase();
    if (citable.has(code)) return [{ ...d, clauseCode: code }];
    droppedClauses.push(d.clauseCode);
    return [];
  });
  return { brief: { ...brief, disputedFindings }, droppedClauses };
}

export async function generateAppealBrief(input: AppealBriefInput, deps: AppealBriefDeps): Promise<AppealBriefResult> {
  const clock = deps.clock ?? realClock;
  const logger = deps.logger ?? getLogger();
  const requestId = deps.requestId ?? null;
  const { config } = deps;
  const prompt = deps.prompt ?? loadPrompt(APPEAL_BRIEF_PROMPT.name, APPEAL_BRIEF_PROMPT.version);
  const models = [config.primaryModel, ...(config.fallbackModel ? [config.fallbackModel] : [])];

  const callsBefore = await deps.callCounter.callsToday();
  const state = new RunState(clock, config.bounds.deadlineMs, callsBefore);
  const pipeline: PipelineDeps = {
    provider: deps.provider,
    bounds: config.bounds,
    clock,
    pacer: deps.pacer ?? sharedPacer,
    logger,
    requestId,
  };

  let status: AiStatus = 'ok';
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let brief: AppealBrief | null = null;
  let droppedClauses: string[] = [];

  // AI-11: the inputs are bounded on write (content and statement <= 2,000 characters, <= 3 links, a short note),
  // so there is nothing optional to trim. If the estimate is still over the budget, no call is made.
  const user = buildAppealBriefUserMessage(input);
  const estimated = estimateTokens(prompt.text) + estimateTokens(user);

  if (estimated > config.bounds.maxInputTokens) {
    status = 'invalid_input';
    errorCode = 'over_budget';
    errorMessage = `Estimated ${estimated} input tokens; the limit is ${config.bounds.maxInputTokens}`;
  } else if (callsBefore >= config.bounds.maxCallsPerDay) {
    status = 'budget_exhausted';
    errorCode = 'daily_budget';
    errorMessage = `Daily limit of ${config.bounds.maxCallsPerDay} AI calls reached`;
  } else {
    try {
      const raw = await runStructured(
        pipeline,
        state,
        {
          system: prompt.text,
          user,
          responseSchema: appealBriefResponseJsonSchema,
          outputSchema: appealBriefOutputSchema,
          buildRepairUser: (previous, errors) => buildRepairUserMessage(user, previous, errors),
        },
        models,
      );
      const verified = verifyBrief(raw, input);
      brief = verified.brief;
      droppedClauses = verified.droppedClauses;
      if (droppedClauses.length > 0) {
        logger.warn(
          { event: 'ai.citation_invalid', requestId, clauses: droppedClauses },
          'appeal brief disputed clauses that were not cited',
        );
      }
    } catch (error) {
      if (!(error instanceof PipelineStop)) throw error;
      status = error.status;
      errorCode = error.code;
      errorMessage = error.message;
    }
  }

  const record = buildRunRecord({
    purpose: 'appeal_brief',
    provider: deps.provider.name,
    primaryModel: config.primaryModel,
    prompt,
    policyVersion: input.policy.version,
    state,
    prices: config.prices,
    now: clock.now(),
    trimmedContext: false,
    outcome: { status, errorCode, errorMessage },
  });
  const aiRunId = await deps.sink.write(record);

  logger.info(
    {
      event: 'ai.run',
      purpose: 'appeal_brief',
      requestId,
      aiRunId,
      status,
      model: record.model,
      attempts: record.attempts,
      repairUsed: record.repairUsed,
      fallbackUsed: record.fallbackUsed,
      parseStrategy: record.parseStrategy,
      costUsd: record.costUsd,
      latencyMs: record.latencyMs,
    },
    'ai run finished',
  );

  return {
    status,
    brief,
    droppedClauses,
    unavailableReason: status === 'ok' ? null : plainReason(status),
    aiRunId,
    aiRun: record,
  };
}
