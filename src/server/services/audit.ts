import type { ActorType, Prisma } from '@prisma/client';

// audit.append(tx, event) (docs/02-system-design.md sec. 9, AUD-1): always called with the caller's
// transaction client, so the event commits or rolls back together with the change it records. S7 adds the
// hash chain (advisory lock, prevHash, hash) here without changing callers.

export type Tx = Prisma.TransactionClient;

export type AuditAction =
  | 'content.created'
  | 'report.created'
  | 'case.opened'
  | 'case.reopened'
  | 'analysis.created'
  | 'analysis.requested'
  | 'decision.created'
  | 'visibility.changed'
  | 'job.failed'
  | 'policy.published'
  | 'reevaluation.started'
  | 'reevaluation.retried';

export interface AuditEventInput {
  actorId: string | null;
  actorType: ActorType;
  action: AuditAction;
  entityType: 'content' | 'report' | 'case' | 'analysis' | 'decision' | 'job' | 'policy' | 'reevaluation';
  entityId: string;
  /** Short summaries only: never the content text (SEC-5). */
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
  policyVersion?: number | null;
  requestId?: string | null;
}

export async function append(tx: Tx, event: AuditEventInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: event.actorId,
      actorType: event.actorType,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      ...(event.before ? { before: event.before } : {}),
      ...(event.after ? { after: event.after } : {}),
      policyVersion: event.policyVersion ?? null,
      requestId: event.requestId ?? null,
    },
  });
}
