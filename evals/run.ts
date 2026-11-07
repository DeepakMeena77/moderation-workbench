// AI evaluation (docs/05-test-plan.md sec. 8, EVAL-1, EVAL-2).
// Runs every labelled case through the product's real decision path: deterministic rules, then the bounded AI
// pipeline (classify), then the server's combine(), exactly as the analyze job does. Scores the result.
//
//   npm run eval              live Gemini (reads .env; spends quota; run by hand)
//   npm run eval -- --mock    deterministic mock provider (CI): checks that the pipeline and report work
//
// Prints a report and, in live mode, writes it to evals/results/<date>-<model>.md. Never prints the API key.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseAiConfig } from '../src/server/ai/aiConfig';
import { InMemoryAiRunSink } from '../src/server/ai/aiRun';
import { classify, createAiProvider } from '../src/server/ai/classify';
import { MockProvider } from '../src/server/ai/mock';
import { createLogger } from '../src/server/logger';
import { combine } from '../src/server/moderation/combine';
import { policyFileSchema, type ActivePolicy } from '../src/server/policy/schema';
import { runRules } from '../src/server/rules';

interface Expectation {
  clean?: boolean;
  mustInclude?: string[];
  mustNotInclude?: string[];
  mustNotConfirm?: string[];
  actionIn?: string[];
  /** The single action a moderator would most likely choose; reported as exact agreement, not a pass/fail rule. */
  exactAction?: string;
  mustEscalate?: boolean;
  escalateIfFlagged?: boolean;
}

interface EvalCase {
  id: string;
  label: string;
  policyVersion: 1 | 2;
  type?: 'post' | 'comment';
  parent?: string;
  text: string;
  expect: Expectation;
}

const mock = process.argv.includes('--mock');
if (!mock) {
  if (!existsSync('.env')) {
    console.error('eval: .env not found. Use --mock for an offline run.');
    process.exit(2);
  }
  process.loadEnvFile('.env');
  process.env.AI_PROVIDER = 'gemini';
} else {
  process.env.AI_PROVIDER = 'mock';
}
process.env.AI_MIN_INTERVAL_MS = mock ? '0' : (process.env.AI_MIN_INTERVAL_MS ?? '4000');

const config = parseAiConfig(process.env);
if (!mock && !config.geminiApiKey) {
  console.error('eval: GEMINI_API_KEY is not set.');
  process.exit(2);
}
const provider = mock ? new MockProvider({ fallbackModel: config.fallbackModel }) : createAiProvider(config);
const logger = createLogger({ level: 'silent' });

const policies: Record<1 | 2, ActivePolicy> = {
  1: loadPolicy(1),
  2: loadPolicy(2),
};

function loadPolicy(version: 1 | 2): ActivePolicy {
  const file = policyFileSchema.parse(JSON.parse(readFileSync(`policies/policy.v${version}.json`, 'utf8')));
  return { version, clauses: file.clauses };
}

/** E19: a long, harmless review close to the 2,000-character limit, built in code to keep the case file short. */
const LONG_REVIEW = Array.from(
  { length: 24 },
  (_, i) => `Day ${i + 1}: the tent stayed dry, the zips ran smoothly and packing it away took under five minutes.`,
)
  .join(' ')
  .slice(0, 1900);

const cases = (JSON.parse(readFileSync('evals/cases.json', 'utf8')) as { cases: EvalCase[] }).cases;

interface Row {
  id: string;
  label: string;
  found: string[];
  confirmed: string[];
  action: string;
  escalated: boolean;
  aiStatus: string;
  model: string;
  fallback: boolean;
  repair: boolean;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  failures: string[];
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const c of cases) {
    const policy = policies[c.policyVersion];
    const text = c.text === 'LONG_REVIEW' ? LONG_REVIEW : c.text;
    const ruleFindings = runRules(text, policy, { createdAt: new Date(), recentByAuthor: [] });
    const ai = await classify(
      {
        policy,
        content: { id: c.id, type: c.type ?? 'post', text },
        parentText: c.parent ?? null,
        reportReasons: {},
        ruleFindings,
        authorHistory: [],
      },
      {
        provider,
        config,
        sink: new InMemoryAiRunSink(),
        callCounter: { callsToday: async () => 0 },
        logger,
        requestId: `eval-${c.id}`,
      },
    );
    const rec = combine({ policy, ruleFindings, ai, reportCount: 0, settings: config.moderation });

    const aiFindings = ai.status === 'ok' ? (ai.output?.findings ?? []) : [];
    const found = [
      ...new Set([...ruleFindings.map((f) => f.clauseCode), ...aiFindings.map((f) => f.clauseCode)]),
    ].sort();
    const confirmed = [
      ...new Set([
        ...ruleFindings.map((f) => f.clauseCode),
        ...aiFindings.filter((f) => f.evidenceType === 'confirmed').map((f) => f.clauseCode),
      ]),
    ].sort();
    const e = c.expect;
    const failures: string[] = [];
    for (const code of e.mustInclude ?? []) if (!found.includes(code)) failures.push(`missed ${code}`);
    for (const code of e.mustNotInclude ?? []) if (found.includes(code)) failures.push(`unexpected ${code}`);
    for (const code of e.mustNotConfirm ?? []) if (confirmed.includes(code)) failures.push(`confirmed ${code}`);
    if (e.actionIn && !e.actionIn.includes(rec.action)) failures.push(`action ${rec.action}`);
    if (e.mustEscalate === true && !rec.needsHuman) failures.push('not escalated');
    if (e.mustEscalate === false && rec.needsHuman) failures.push('escalated');
    if (e.escalateIfFlagged && found.length > 0 && !rec.needsHuman) failures.push('flagged but not escalated');

    const run = ai.aiRun;
    rows.push({
      id: c.id,
      label: c.label,
      found,
      confirmed,
      action: rec.action,
      escalated: rec.needsHuman,
      aiStatus: run.status,
      model: run.model,
      fallback: run.fallbackUsed,
      repair: run.repairUsed,
      latencyMs: run.latencyMs,
      tokensIn: run.inputTokens,
      tokensOut: run.outputTokens + run.thinkingTokens,
      costUsd: Number(run.costUsd),
      failures,
    });
    console.log(
      `${c.id.padEnd(5)} ${failures.length === 0 ? 'pass' : 'FAIL'}  ${rec.action.padEnd(6)} ${found.join(',') || '-'}`,
    );
  }

  // ---- Metrics -----------------------------------------------------------------------------------------------
  // Labelled precision counts only codes a case says something about (mustInclude, mustNotInclude, or anything
  // on a clean case). Strict precision counts every cited code a case did not expect as a false positive, so a
  // quoted threat confirmed as THR-1, or banter cited as HAR-1, lowers it.
  let tp = 0;
  let fp = 0;
  let fpStrict = 0;
  let fn = 0;
  for (const c of cases) {
    const row = rows.find((r) => r.id === c.id);
    if (!row) continue;
    const expected = new Set(c.expect.mustInclude ?? []);
    const notExpected = new Set([...(c.expect.mustNotInclude ?? []), ...(c.expect.clean ? row.found : [])]);
    for (const code of row.found) {
      if (expected.has(code)) tp++;
      else {
        fpStrict++;
        if (notExpected.has(code)) fp++;
      }
    }
    for (const code of expected) if (!row.found.includes(code)) fn++;
  }
  const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${Math.round((100 * n) / d)}%`);
  const withAction = cases.filter((c) => c.expect.actionIn);
  const actionOk = withAction.filter((c) =>
    rows.find((r) => r.id === c.id)?.failures.every((f) => !f.startsWith('action')),
  );
  const withExact = cases.filter((c) => c.expect.exactAction);
  const exactOk = withExact.filter((c) => rows.find((r) => r.id === c.id)?.action === c.expect.exactAction);
  const mustEsc = cases.filter((c) => c.expect.mustEscalate === true);
  const escOk = mustEsc.filter((c) => rows.find((r) => r.id === c.id)?.escalated);
  const clean = cases.filter((c) => c.expect.clean);
  const falseEsc = clean.filter((c) => rows.find((r) => r.id === c.id)?.escalated);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const pctl = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;
  const sum = (f: (r: Row) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  const passed = rows.filter((r) => r.failures.length === 0).length;

  const metrics = [
    ['Cases passed', `${passed} / ${rows.length}`],
    ['Clause precision, labelled codes', pct(tp, tp + fp)],
    ['Clause precision, strict (every unexpected citation is a false positive)', pct(tp, tp + fpStrict)],
    ['Clause recall', pct(tp, tp + fn)],
    ['Exact action agreement', `${exactOk.length} / ${withExact.length}`],
    ['Action in expected set', `${actionOk.length} / ${withAction.length}`],
    ['Must-escalate recall (target 100%)', pct(escOk.length, mustEsc.length)],
    ['False escalation on clean cases', `${falseEsc.length} / ${clean.length}`],
    ['AI status not ok', `${rows.filter((r) => r.aiStatus !== 'ok').length} / ${rows.length}`],
    ['Invalid-output rate', pct(rows.filter((r) => r.aiStatus === 'invalid_output').length, rows.length)],
    ['Fallback model used', `${rows.filter((r) => r.fallback).length}`],
    ['Repair call used', `${rows.filter((r) => r.repair).length}`],
    ['Latency p50 / p90 (ms)', `${pctl(0.5)} / ${pctl(0.9)}`],
    ['Tokens in / out (incl. thinking)', `${sum((r) => r.tokensIn)} / ${sum((r) => r.tokensOut)}`],
    ['Estimated cost (USD)', sum((r) => r.costUsd).toFixed(4)],
  ];

  const mode = mock ? 'mock provider (pipeline check, not a quality measure)' : `live ${config.primaryModel}`;
  const lines: string[] = [];
  lines.push(`# AI evaluation - ${new Date().toISOString().slice(0, 10)} - ${mode}`, '');
  lines.push('| Metric | Value |', '| --- | --- |', ...metrics.map(([k, v]) => `| ${k} | ${v} |`), '');
  lines.push('| Case | Label | Result | Action | Clauses found | Escalated | AI | Latency ms |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const result = r.failures.length === 0 ? 'pass' : `fail: ${r.failures.join('; ')}`;
    lines.push(
      `| ${r.id} | ${r.label} | ${result} | ${r.action} | ${r.found.join(', ') || '-'} | ${r.escalated ? 'yes' : 'no'} | ${r.aiStatus}${r.fallback ? ' (fallback)' : ''} | ${r.latencyMs} |`,
    );
  }
  const report = lines.join('\n') + '\n';
  console.log('\n' + report);

  if (!mock) {
    mkdirSync('evals/results', { recursive: true });
    // One file per run (UTC date and time), so repeated runs are kept side by side.
    const stamp = new Date().toISOString().slice(0, 16).replace(':', '').replace('T', '-');
    const file = `evals/results/${stamp}Z-${config.primaryModel}.md`;
    writeFileSync(file, report, 'utf8');
    console.log(`report written to ${file}`);
  }
}

// Exit 0 when every case ran; quality is reported, not enforced. Exit 1 only if the run itself failed.
main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`eval: run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
