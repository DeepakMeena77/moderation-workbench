import type { JobType } from '@prisma/client';
import { getAiConfig, type AiConfig } from '../ai/aiConfig';
import type { AiRunSink, CallCounter } from '../ai/aiRun';
import { generateAppealBrief } from '../ai/appealBrief';
import { classify, createAiProvider } from '../ai/classify';
import type { AiProvider } from '../ai/provider';
import { getDb } from '../db';
import { getLogger } from '../logger';
import { createDbAiRunSink, createDbCallCounter } from '../services/aiRuns';
import { appealBriefPayloadSchema, prepareAppealBrief, recordAppealBrief } from '../services/appealBriefs';
import { analyzePayloadSchema, prepareAnalysis, recordAnalysis, type AnalysisResult } from '../services/analysis';
import type { ClaimedJob } from './queue';

// One handler per job type (docs/02-system-design.md sec. 6). A thrown error is an infrastructure failure:
// the runner re-queues the job with back-off and fails it after maxAttempts. An AI failure is not thrown: it is
// a successful job with a degraded (rule-only) analysis routed to a human.

export type JobHandler = (job: ClaimedJob) => Promise<void>;

/** Collaborators of the AI jobs. Production uses the defaults; tests inject the mock provider and bounds. */
export interface AnalyzeJobDeps {
  provider?: AiProvider;
  aiConfig?: AiConfig;
  sink?: AiRunSink;
  callCounter?: CallCounter;
  requestId?: string | null;
}

let defaultProvider: AiProvider | undefined;

/**
 * The analyse job (02 sec. 5 and sec. 6): rules, then the bounded AI pipeline, then combine and Analysis seq + 1.
 * The AI call runs here, outside any transaction, because it may take up to AI_DEADLINE_MS. Only job handlers call
 * the LLM (02 sec. 2). Nothing on this path changes visibility (HUM-1).
 */
export async function runAnalyzeJob(payload: unknown, deps: AnalyzeJobDeps = {}): Promise<AnalysisResult> {
  const parsed = analyzePayloadSchema.parse(payload);
  const requestId = deps.requestId ?? null;
  const aiConfig = deps.aiConfig ?? getAiConfig();

  const prepared = await prepareAnalysis(parsed.caseId);
  if ('skipped' in prepared) {
    getLogger().info({ event: 'analysis.skipped', caseId: parsed.caseId, requestId, caseStatus: prepared.skipped });
    return { status: 'skipped', caseStatus: prepared.skipped, aiRunId: null };
  }

  const db = getDb();
  const ai = await classify(prepared.classifyInput, {
    provider: deps.provider ?? (defaultProvider ??= createAiProvider(aiConfig)),
    config: aiConfig,
    sink: deps.sink ?? createDbAiRunSink(db),
    callCounter: deps.callCounter ?? createDbCallCounter(db),
    logger: getLogger().child({ caseId: parsed.caseId }),
    requestId,
  });

  return recordAnalysis(parsed, prepared, ai, aiConfig.moderation, requestId);
}

export type AppealBriefJobResult = { status: 'written' | 'skipped'; aiRunId: string | null; aiStatus: string | null };

/**
 * The appeal brief job (02 sec. 5.7, AI-12): the same bounded pipeline as classify, one AiRun, then the brief is
 * stored through services/appealBriefs.ts, which writes only Appeal.brief and briefAiRunId. Like the analyse
 * job, an AI failure is a successful job: the stored brief says the summary is unavailable and the senior
 * moderator reviews the appeal without it. Nothing here can resolve the appeal or change visibility (HUM-1).
 */
export async function runAppealBriefJob(payload: unknown, deps: AnalyzeJobDeps = {}): Promise<AppealBriefJobResult> {
  const { appealId } = appealBriefPayloadSchema.parse(payload);
  const requestId = deps.requestId ?? null;
  const aiConfig = deps.aiConfig ?? getAiConfig();

  const prepared = await prepareAppealBrief(appealId);
  if ('skipped' in prepared) {
    getLogger().info({ event: 'appeal.brief_skipped', appealId, requestId, reason: prepared.skipped });
    return { status: 'skipped', aiRunId: null, aiStatus: null };
  }

  const db = getDb();
  const ai = await generateAppealBrief(prepared.input, {
    provider: deps.provider ?? (defaultProvider ??= createAiProvider(aiConfig)),
    config: aiConfig,
    sink: deps.sink ?? createDbAiRunSink(db),
    callCounter: deps.callCounter ?? createDbCallCounter(db),
    logger: getLogger().child({ appealId }),
    requestId,
  });

  const { written } = await recordAppealBrief(appealId, ai, requestId);
  return { status: written ? 'written' : 'skipped', aiRunId: ai.aiRunId, aiStatus: ai.status };
}

export const HANDLERS: Record<JobType, JobHandler> = {
  analyze: async (job) => {
    await runAnalyzeJob(job.payload, { requestId: `job:${job.id}` });
  },
  appeal_brief: async (job) => {
    await runAppealBriefJob(job.payload, { requestId: `job:${job.id}` });
  },
};
