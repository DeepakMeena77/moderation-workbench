import { createHash } from 'node:crypto';
import type { ActorType, AuditEvent, Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';

// The audit trail (docs/02-system-design.md sec. 9, AUD-1..5).
// - append(tx, event) is always called with the caller's transaction client, so the event commits or rolls back
//   together with the change it records (AUD-1).
// - Events are insert-only (forbid_mutation trigger, AUD-2) and hash-chained (AUD-3):
//   hash = sha256(prevHash + canonicalJson(event)). The migration 20261108110000_s7_audit_chain chained the
//   events written before S7 with the same canonical form, in SQL (audit_event_hash).

export type Tx = Prisma.TransactionClient;

export const AUDIT_ACTIONS = [
  'content.created',
  'report.created',
  'case.opened',
  'case.reopened',
  'analysis.created',
  'analysis.requested',
  'decision.created',
  'visibility.changed',
  'appeal.created',
  'appeal.assigned',
  'appeal.brief_created',
  'appeal.resolved',
  'job.failed',
  'policy.published',
  'reevaluation.started',
  'reevaluation.retried',
  'access.denied',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  'content',
  'report',
  'case',
  'analysis',
  'decision',
  'appeal',
  'job',
  'policy',
  'reevaluation',
  'route',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditEventInput {
  actorId: string | null;
  actorType: ActorType;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  /** Short summaries only: never the content text (SEC-5). */
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
  policyVersion?: number | null;
  requestId?: string | null;
}

/** The prevHash of the first event. */
export const GENESIS_HASH = '0'.repeat(64);

/** Serialises the chain (02 sec. 9). Held until the caller's transaction ends. */
const CHAIN_LOCK_KEY = 7331;

/**
 * JSON with object keys sorted by code point and no whitespace, so the same event always hashes the same.
 * Mirrors audit_canonical_json() in the S7 migration.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

interface HashedFields {
  at: Date;
  actorId: string | null;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  policyVersion: number | null;
  requestId: string | null;
}

/** The hash of one event given the previous event's hash (mirrors audit_event_hash() in the migration). */
export function eventHash(prevHash: string, e: HashedFields): string {
  const payload = canonicalJson({
    action: e.action,
    actorId: e.actorId,
    actorType: e.actorType,
    after: e.after ?? null,
    at: e.at.toISOString(),
    before: e.before ?? null,
    entityId: e.entityId,
    entityType: e.entityType,
    policyVersion: e.policyVersion,
    requestId: e.requestId,
  });
  return createHash('sha256')
    .update(prevHash + payload, 'utf8')
    .digest('hex');
}

/**
 * What the database will hand back for a JSON summary: a JSON round trip drops undefined and turns dates into
 * strings, so the hash computed now matches the one verify() computes from the stored row.
 */
function stored(value: Prisma.InputJsonObject | undefined): Prisma.InputJsonObject | null {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject);
}

export async function append(tx: Tx, event: AuditEventInput): Promise<void> {
  // The lock makes "read the last hash, insert the next event" atomic across transactions. Every transaction
  // here runs at READ COMMITTED, so the read below sees whatever the previous lock holder committed.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY}::bigint)`;
  const last = await tx.auditEvent.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const fields: HashedFields = {
    at: new Date(),
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: stored(event.before),
    after: stored(event.after),
    policyVersion: event.policyVersion ?? null,
    requestId: event.requestId ?? null,
  };
  await tx.auditEvent.create({
    data: {
      at: fields.at,
      actorId: fields.actorId,
      actorType: fields.actorType,
      action: fields.action,
      entityType: fields.entityType,
      entityId: fields.entityId,
      ...(event.before ? { before: event.before } : {}),
      ...(event.after ? { after: event.after } : {}),
      policyVersion: fields.policyVersion,
      requestId: fields.requestId,
      prevHash,
      hash: eventHash(prevHash, fields),
    },
  });
}

// --- Verify (AUD-3) ---

export interface ChainVerification {
  intact: boolean;
  /** Events checked, up to and including the first broken one. */
  checked: number;
  /** The first event whose own hash or link to its predecessor does not match. */
  firstBrokenId: string | null;
}

const VERIFY_BATCH = 500;

/** Walks the events in id order and recomputes every hash and link. */
export async function verifyChain(): Promise<ChainVerification> {
  const db = getDb();
  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  let after: bigint | null = null;
  for (;;) {
    const rows: AuditEvent[] = await db.auditEvent.findMany({
      where: after === null ? {} : { id: { gt: after } },
      orderBy: { id: 'asc' },
      take: VERIFY_BATCH,
    });
    for (const row of rows) {
      checked += 1;
      // A changed row fails its own hash; a deleted row, or a predecessor whose hash was rewritten to match its
      // new content, fails the link.
      if (row.prevHash !== expectedPrev || row.hash !== eventHash(row.prevHash, row)) {
        return { intact: false, checked, firstBrokenId: row.id.toString() };
      }
      expectedPrev = row.hash;
    }
    const last = rows.at(-1);
    if (!last || rows.length < VERIFY_BATCH) break;
    after = last.id;
  }
  return { intact: true, checked, firstBrokenId: null };
}

// --- Denied access (AUD-4) ---

export interface DeniedAccess {
  route: string;
  method: string;
  code: string;
}

/**
 * Records a 403 as an access.denied event. Best effort and in its own transaction: the request has already
 * failed and rolled back, and a failure to record must not change the response. Failures are logged.
 */
export async function recordAccessDenied(
  actor: Actor,
  denied: DeniedAccess,
  requestId: string,
  log: Logger,
): Promise<void> {
  try {
    await getDb().$transaction((tx) =>
      append(tx, {
        actorId: actor.id,
        actorType: 'human',
        action: 'access.denied',
        entityType: 'route',
        entityId: denied.route,
        after: { method: denied.method, code: denied.code, role: actor.role },
        requestId,
      }),
    );
  } catch (error) {
    log.error({ event: 'audit.write_failed', action: 'access.denied', route: denied.route, err: error });
  }
}

// --- List (AUD-5) ---

const identifier = z.string().trim().min(1).max(64);

export const auditListQuerySchema = z
  .object({
    actorType: z.enum(['human', 'system', 'ai']).optional(),
    action: identifier.regex(/^[a-z_]+\.[a-z_]+$/, 'Unknown action.').optional(),
    entity: identifier.regex(/^[a-z_]+$/, 'Unknown entity.').optional(),
    /** ISO date-times: the client turns the viewer's local dates into an instant range [from, to). */
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    q: z.string().trim().max(200).optional(),
    cursor: z
      .string()
      .regex(/^\d{1,19}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to), {
    message: 'The start date must be before the end date.',
    path: ['to'],
  });

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export interface AuditRow {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  policyVersion: number | null;
  requestId: string | null;
  hash: string;
}

export interface AuditPage {
  items: AuditRow[];
  nextCursor: string | null;
  total: number;
}

async function searchFilter(q: string): Promise<Prisma.AuditEventWhereInput> {
  const db = getDb();
  const actors = await db.user.findMany({
    where: {
      OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }],
    },
    select: { id: true },
    take: 50,
  });
  const or: Prisma.AuditEventWhereInput[] = [
    { entityId: { contains: q, mode: 'insensitive' } },
    { action: { contains: q, mode: 'insensitive' } },
    { requestId: q },
  ];
  if (actors.length > 0) or.push({ actorId: { in: actors.map((a) => a.id) } });
  // An event number, with or without its leading hash sign, finds the event the integrity banner names.
  const idMatch = /^#?(\d{1,18})$/.exec(q);
  if (idMatch?.[1]) or.push({ id: BigInt(idMatch[1]) });
  return { OR: or };
}

export async function listAudit(query: AuditListQuery): Promise<AuditPage> {
  const db = getDb();
  const and: Prisma.AuditEventWhereInput[] = [];
  if (query.actorType) and.push({ actorType: query.actorType });
  if (query.action) and.push({ action: query.action });
  if (query.entity) and.push({ entityType: query.entity });
  if (query.from || query.to) {
    and.push({
      at: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(query.to) } : {}) },
    });
  }
  if (query.q) and.push(await searchFilter(query.q));
  const where: Prisma.AuditEventWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.auditEvent.findMany({
      where: query.cursor ? { AND: [...and, { id: { lt: BigInt(query.cursor) } }] } : where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    }),
    db.auditEvent.count({ where }),
  ]);
  const page = rows.slice(0, query.limit);
  const actorIds = [...new Set(page.map((r) => r.actorId).filter((id): id is string => id !== null))];
  const users =
    actorIds.length > 0
      ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  return {
    items: page.map((r) => ({
      id: r.id.toString(),
      at: r.at.toISOString(),
      actorId: r.actorId,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      actorType: r.actorType,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      policyVersion: r.policyVersion,
      requestId: r.requestId,
      hash: r.hash,
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id.toString() ?? null) : null,
    total,
  };
}
