#!/usr/bin/env node
// Live smoke test of the AI layer: ONE real classify() run against Gemini, with the full bounded pipeline
// (timeout, retries, fallback, parse ladder, repair, verify). It spends free-tier quota: run it by hand only.
//
//   npx tsx scripts/ai-smoke.mjs                         classify the default insult
//   npx tsx scripts/ai-smoke.mjs "some text"             classify your own text
//   npx tsx scripts/ai-smoke.mjs --env-file .env.other   read the variables from another file (default .env)
//   npx tsx scripts/ai-smoke.mjs --dry-run               same wiring with the mock provider; no network call
//
// tsx (a dev dependency) runs it because the AI layer is TypeScript. It prints only the model used, the status,
// the latency, the tokens and the finding codes (plus the error code on failure). It never prints the API key,
// the prompt, the model output or the content.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const envIndex = args.indexOf('--env-file');
const envFile = resolve(envIndex >= 0 ? (args[envIndex + 1] ?? '') : '.env');
const text =
  args.filter((arg, i) => !arg.startsWith('--') && !(envIndex >= 0 && i === envIndex + 1))[0] ??
  'You are a worthless idiot';

if (!existsSync(envFile)) {
  console.error(`ai-smoke: env file not found: ${envFile}`);
  process.exit(2);
}
process.loadEnvFile(envFile);
// This script exists to exercise the live provider, whatever AI_PROVIDER says for the app.
process.env.AI_PROVIDER = 'gemini';
process.env.AI_MIN_INTERVAL_MS = '0';

const { parseAiConfig, AiConfigError } = await import('../src/server/ai/aiConfig.ts');
const { InMemoryAiRunSink } = await import('../src/server/ai/aiRun.ts');
const { classify, createAiProvider } = await import('../src/server/ai/classify.ts');
const { MockProvider } = await import('../src/server/ai/mock.ts');
const { createLogger } = await import('../src/server/logger.ts');
const { policyFileSchema } = await import('../src/server/policy/schema.ts');

let config;
try {
  config = parseAiConfig(process.env);
} catch (error) {
  // AiConfigError names the variables and what is expected, never their values.
  console.error(`ai-smoke: ${error instanceof AiConfigError ? error.message : 'invalid AI configuration'}`);
  process.exit(2);
}
if (!config.geminiApiKey && !dryRun) {
  console.error('ai-smoke: GEMINI_API_KEY is not set.');
  process.exit(2);
}

const file = policyFileSchema.parse(JSON.parse(readFileSync('policies/policy.v1.json', 'utf8')));
const policy = { version: 1, clauses: file.clauses };
const provider = dryRun ? new MockProvider({ fallbackModel: config.fallbackModel }) : createAiProvider(config);

const result = await classify(
  {
    policy,
    content: { id: 'ai-smoke', type: 'post', text },
    parentText: null,
    reportReasons: {},
    ruleFindings: [],
    authorHistory: [],
  },
  {
    provider,
    config,
    sink: new InMemoryAiRunSink(),
    callCounter: { callsToday: async () => 0 },
    logger: createLogger({ level: 'silent' }),
    requestId: 'ai-smoke',
  },
);

const run = result.aiRun;
const lines = [
  `mode:          ${dryRun ? 'dry run (mock provider, no network)' : 'live Gemini'}`,
  `model used:    ${run.model}${run.fallbackUsed ? ' (fallback)' : ''}`,
  `models tried:  ${run.modelsTried.join(', ') || '-'}`,
  `status:        ${run.status}${run.errorCode ? ` (${run.errorCode})` : ''}`,
  `latency:       ${run.latencyMs} ms over ${run.attempts} call(s)${run.repairUsed ? ', 1 repair' : ''}`,
  `tokens:        input ${run.inputTokens}, output ${run.outputTokens}, thinking ${run.thinkingTokens}`,
  `finding codes: ${result.output?.findings.map((f) => `${f.clauseCode} (${f.evidenceType})`).join(', ') || '-'}`,
];
console.log(lines.join('\n'));
process.exit(run.status === 'ok' ? 0 : 1);
