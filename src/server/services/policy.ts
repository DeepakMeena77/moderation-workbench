import type { CaseStatus, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { analyzeDedupeKey, enqueue } from '../jobs/queue';
import { getLogger } from '../logger';
import { policyChangeSince, policyDiff, type PolicyChange, type PolicyDiff } from '../policy/diff';
import { clausesSchema, policyContentHash, policyFileSchema, type ActivePolicy, type Clause } from '../policy/schema';
import { append, type Tx } from './audit';
import { toRunView, type ReevaluationRunView } from './reevaluation';

// Policy versions (POL-1..5, docs/02-system-design.md sec. 4 and sec. 6): reads, compare, validate and publish.
// Stored clauses are parsed again on read: they were validated on publish, and a bad row must fail loudly rather
// than feed the rules garbage. Versions are immutable; publishing retires the active one and inserts the next.

/** Cases a new policy re-analyses (POL-3). Resolved, auto-cleared and appeal-resolved cases keep their analysis. */
export const UNRESOLVED_STATUSES: readonly CaseStatus[] = ['pending_analysis', 'awaiting_review', 'appealed'];

/** Pasted text, not parsed JSON, so a syntax error is reported to the admin like any other validation error. */
export const MAX_POLICY_CHARS = 90_000;
export const policyTextSchema = z.object({ json: z.string().min(1).max(MAX_POLICY_CHARS) });
export type PolicyTextInput = z.infer<typeof policyTextSchema>;

export const policyVersionParamsSchema = z.object({ version: z.coerce.number().int().positive().max(1_000_000) });
export const compareQuerySchema = z.object({
  from: z.coerce.number().int().positive().max(1_000_000),
  to: z.coerce.number().int().positive().max(1_000_000),
});

export async function getActivePolicy(db: Tx | PrismaClient = getDb()): Promise<ActivePolicy | null> {
  const row = await db.policy.findFirst({ where: { status: 'active' }, select: { version: true, clauses: true } });
  if (!row) return null;
  return { version: row.version, clauses: clausesSchema.parse(row.clauses) };
}

/** For job handlers: no active policy is a deployment fault (not seeded), so the job retries and then fails. */
export async function requireActivePolicy(db: Tx | PrismaClient = getDb()): Promise<ActivePolicy> {
  const policy = await getActivePolicy(db);
  if (!policy) throw new Error('No active policy. Run npm run db:seed to install policy v1.');
  return policy;
}

// --- Reads (POL-5) ---

export interface PolicySummary {
  version: number;
  status: 'active' | 'retired';
  notes: string | null;
  publishedAt: string;
  publishedBy: string | null;
  clauseCount: number;
  clauseCodes: string[];
}

export interface PolicyDetail extends PolicySummary {
  clauses: Clause[];
  /** The re-evaluation run started when this version was published (none for the seeded v1). */
  run: ReevaluationRunView | null;
}

export interface PolicyList {
  versions: PolicySummary[];
  /** The most recent run, so the page can show its progress again after a reload. */
  latestRun: ReevaluationRunView | null;
}

interface PolicyRow {
  version: number;
  status: 'active' | 'retired';
  notes: string | null;
  publishedAt: Date;
  publishedById: string | null;
  clauses: unknown;
}

async function publisherNames(db: Tx | PrismaClient, rows: PolicyRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => row.publishedById).filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

function toSummary(row: PolicyRow, clauses: Clause[], names: Map<string, string>): PolicySummary {
  return {
    version: row.version,
    status: row.status,
    notes: row.notes,
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedById ? (names.get(row.publishedById) ?? null) : null,
    clauseCount: clauses.length,
    clauseCodes: clauses.map((clause) => clause.code),
  };
}

const POLICY_SELECT = {
  version: true,
  status: true,
  notes: true,
  publishedAt: true,
  publishedById: true,
  clauses: true,
} as const;

export async function listPolicies(): Promise<PolicyList> {
  const db = getDb();
  const [rows, latest] = await Promise.all([
    db.policy.findMany({ orderBy: { version: 'desc' }, select: POLICY_SELECT }),
    db.reevaluationRun.findFirst({ orderBy: { createdAt: 'desc' } }),
  ]);
  const names = await publisherNames(db, rows);
  return {
    versions: rows.map((row) => toSummary(row, clausesSchema.parse(row.clauses), names)),
    latestRun: latest ? toRunView(latest) : null,
  };
}

async function loadVersion(db: Tx | PrismaClient, version: number): Promise<{ row: PolicyRow; clauses: Clause[] }> {
  const row = await db.policy.findUnique({ where: { version }, select: POLICY_SELECT });
  if (!row) throw new AppError('NOT_FOUND', `Policy v${version} does not exist.`);
  return { row, clauses: clausesSchema.parse(row.clauses) };
}

export async function getPolicy(version: number): Promise<PolicyDetail> {
  const db = getDb();
  const { row, clauses } = await loadVersion(db, version);
  const [names, run] = await Promise.all([
    publisherNames(db, [row]),
    db.reevaluationRun.findFirst({ where: { toVersion: version }, orderBy: { createdAt: 'desc' } }),
  ]);
  return { ...toSummary(row, clauses, names), clauses, run: run ? toRunView(run) : null };
}

export interface PolicyComparison {
  from: number;
  to: number;
  diff: PolicyDiff;
}

/** POL-5: any two versions, in either order. */
export async function comparePolicies(from: number, to: number): Promise<PolicyComparison> {
  const db = getDb();
  const [a, b] = await Promise.all([loadVersion(db, from), loadVersion(db, to)]);
  return { from, to, diff: policyDiff(a.clauses, b.clauses) };
}

/**
 * POL-4: a decision keeps the policy version it was made under; when a newer version is active, its history and
 * appeal pages show "Policy changed since this decision (v1 -> v2)". S4 and S5 render it.
 */
export async function policyChangeNotice(
  decisionPolicyVersion: number,
  db: Tx | PrismaClient = getDb(),
): Promise<PolicyChange | null> {
  const active = await db.policy.findFirst({ where: { status: 'active' }, select: { version: true } });
  return active ? policyChangeSince(decisionPolicyVersion, active.version) : null;
}

// --- Validate and publish (POL-2, POL-3) ---

export interface ValidationIssue {
  /** A JSON path such as "clauses.2.allowedActions.0", or "(root)". */
  path: string;
  message: string;
}

type ParsedPolicyText =
  { valid: true; clauses: Clause[]; notes: string | null } | { valid: false; errors: ValidationIssue[] };

/** Pure: JSON syntax first, then the policy schema. Every issue carries the path an admin can find in the text. */
export function parsePolicyText(text: string): ParsedPolicyText {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { valid: false, errors: [{ path: '(root)', message: `Not valid JSON: ${detail}` }] };
  }
  const parsed = policyFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
        message: issue.message,
      })),
    };
  }
  return { valid: true, clauses: parsed.data.clauses, notes: parsed.data.notes ?? null };
}

export interface PublishPreview {
  fromVersion: number | null;
  /** What the version will be if published now. The server assigns it; a "version" in the paste is ignored. */
  nextVersion: number;
  diff: PolicyDiff;
  /** Identical clauses to an existing version: publishing would answer 409 POLICY_UNCHANGED. */
  sameAsVersion: number | null;
  impact: { unresolvedCases: number };
}

export interface PolicyValidation {
  valid: boolean;
  errors: ValidationIssue[];
  preview: PublishPreview | null;
}

async function nextVersionNumber(db: Tx | PrismaClient): Promise<number> {
  const max = await db.policy.aggregate({ _max: { version: true } });
  return (max._max.version ?? 0) + 1;
}

/** POL-2: errors with paths, or the diff against the active version and how many cases would be re-analysed. */
export async function validatePolicy(input: PolicyTextInput): Promise<PolicyValidation> {
  const parsed = parsePolicyText(input.json);
  if (!parsed.valid) return { valid: false, errors: parsed.errors, preview: null };
  const db = getDb();
  const [active, nextVersion, same, unresolvedCases] = await Promise.all([
    getActivePolicy(db),
    nextVersionNumber(db),
    db.policy.findUnique({ where: { contentHash: policyContentHash(parsed.clauses) }, select: { version: true } }),
    db.case.count({ where: { status: { in: [...UNRESOLVED_STATUSES] } } }),
  ]);
  return {
    valid: true,
    errors: [],
    preview: {
      fromVersion: active?.version ?? null,
      nextVersion,
      diff: policyDiff(active?.clauses ?? [], parsed.clauses),
      sameAsVersion: same?.version ?? null,
      impact: { unresolvedCases },
    },
  };
}

export interface PublishResult {
  version: number;
  run: ReevaluationRunView;
}

/** Any fixed key: publishes are rare, and one at a time keeps "next version" and "retire the active" consistent. */
const PUBLISH_LOCK_KEY = 60_001;

/**
 * POL-3, one transaction (02 sec. 6): retire v(n), insert v(n+1) as active, create the ReevaluationRun with the
 * number of unresolved cases, and enqueue one analyse job per case (reason policy_change, with the run id).
 * Identical clauses to any existing version answer 409 POLICY_UNCHANGED (contentHash is unique), so a double
 * click or a retried request never creates a second version or a second run.
 */
export async function publishPolicy(actor: Actor, input: PolicyTextInput, requestId: string): Promise<PublishResult> {
  const parsed = parsePolicyText(input.json);
  if (!parsed.valid) throw new AppError('VALIDATION_FAILED', 'The policy is not valid.', parsed.errors);
  const contentHash = policyContentHash(parsed.clauses);

  const result = await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PUBLISH_LOCK_KEY}::bigint)`;

      const same = await tx.policy.findUnique({ where: { contentHash }, select: { version: true } });
      if (same) {
        throw new AppError('POLICY_UNCHANGED', `These clauses are identical to policy v${same.version}.`, {
          sameAsVersion: same.version,
        });
      }

      const active = await tx.policy.findFirst({
        where: { status: 'active' },
        select: { id: true, version: true, clauses: true },
      });
      const version = await nextVersionNumber(tx);
      // Retire first, then insert: the partial unique index allows only one active row at any moment (POL-1).
      if (active) await tx.policy.update({ where: { id: active.id }, data: { status: 'retired' } });
      const policy = await tx.policy.create({
        data: {
          version,
          status: 'active',
          clauses: parsed.clauses,
          notes: parsed.notes,
          contentHash,
          publishedById: actor.id,
        },
        select: { id: true },
      });

      const cases = await tx.case.findMany({
        where: { status: { in: [...UNRESOLVED_STATUSES] } },
        select: { id: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      const run = await tx.reevaluationRun.create({
        data: {
          fromVersion: active?.version ?? 0,
          toVersion: version,
          total: cases.length,
          startedById: actor.id,
          // A run with nothing to do is finished as soon as it exists.
          ...(cases.length === 0 ? { finishedAt: new Date() } : {}),
        },
      });
      for (const kase of cases) {
        await enqueue(tx, {
          type: 'analyze',
          payload: { caseId: kase.id, reason: 'policy_change', runId: run.id },
          dedupeKey: analyzeDedupeKey(kase.id, 'policy_change', version, run.id),
          runId: run.id,
        });
      }

      const diff = policyDiff(active ? clausesSchema.parse(active.clauses) : [], parsed.clauses);
      await append(tx, {
        actorId: actor.id,
        actorType: 'human',
        action: 'policy.published',
        entityType: 'policy',
        entityId: policy.id,
        before: { version: active?.version ?? null },
        after: {
          version,
          contentHash,
          clauses: parsed.clauses.length,
          added: diff.added.map((clause) => clause.code),
          removed: diff.removed.map((clause) => clause.code),
          changed: diff.changed.map((change) => change.code),
        },
        policyVersion: version,
        requestId,
      });
      await append(tx, {
        actorId: actor.id,
        actorType: 'human',
        action: 'reevaluation.started',
        entityType: 'reevaluation',
        entityId: run.id,
        after: { fromVersion: run.fromVersion, toVersion: version, total: cases.length },
        policyVersion: version,
        requestId,
      });
      return { version, run: toRunView(run) };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  getLogger().info({
    event: 'policy.published',
    version: result.version,
    runId: result.run.id,
    total: result.run.total,
    requestId,
    userId: actor.id,
  });
  return { version: result.version, run: result.run };
}
