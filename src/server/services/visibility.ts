import type { Role, Visibility } from '@prisma/client';
import type { Actor } from '../auth/session';
import { AppError } from '../errors';
import type { ModAction } from '../policy/schema';
import { append, type Tx } from './audit';

// The only writer of Content.visibility (HUM-1, docs/02-system-design.md sec. 8). Callers: decisions.decide()
// and appeals.resolve(). Code under src/server/{ai,rules,moderation,jobs} may not import this file
// (ESLint no-restricted-imports plus tests/unit/boundaries.test.ts). The database trigger
// "Content_visibility_human_only" refuses any visibility change in a transaction that did not pass through
// here, so the rule holds even if this check were bypassed.

/** Action -> visibility (02 sec. 8). */
export const ACTION_VISIBILITY: Record<ModAction, Visibility> = {
  none: 'visible',
  label: 'labeled',
  limit: 'limited',
  remove: 'removed',
};

const HUMAN_DECIDERS: ReadonlySet<Role> = new Set(['moderator', 'senior_moderator']);

/** A human actor, or a non-human one (job, AI) that must always be refused. */
export type VisibilityActor = Actor | { type: 'system' | 'ai'; id: null };

export interface SetVisibilityInput {
  contentId: string;
  visibility: Visibility;
  actor: VisibilityActor;
  /** The case and decision (or appeal) behind the change, for the audit event. */
  caseId: string;
  decisionId: string;
  /** Set when an appeal resolution (APP-5) changes the visibility. */
  appealId?: string;
  policyVersion: number;
  requestId: string;
}

export interface VisibilityResult {
  before: Visibility;
  after: Visibility;
  changed: boolean;
}

export function isHumanDecider(actor: VisibilityActor): actor is Actor {
  return actor.type === 'human' && HUMAN_DECIDERS.has(actor.role);
}

/** Must run inside the caller's transaction (AUD-1): the change and its audit event commit together. */
export async function setVisibility(tx: Tx, input: SetVisibilityInput): Promise<VisibilityResult> {
  const { actor } = input;
  if (!isHumanDecider(actor)) {
    throw new AppError('HUMAN_REQUIRED', 'Only a human moderator can change what people see.');
  }
  const content = await tx.content.findUnique({ where: { id: input.contentId }, select: { visibility: true } });
  if (!content) throw new AppError('NOT_FOUND', 'This content does not exist.');
  if (content.visibility === input.visibility) {
    return { before: content.visibility, after: content.visibility, changed: false };
  }

  // Transaction-local (is_local = true): the flag ends with this transaction and never leaks to another
  // request that later reuses the pooled connection.
  await tx.$queryRaw`SELECT set_config('app.actor_type', 'human', true)`;
  await tx.content.update({ where: { id: input.contentId }, data: { visibility: input.visibility } });
  await append(tx, {
    actorId: actor.id,
    actorType: 'human',
    action: 'visibility.changed',
    entityType: 'content',
    entityId: input.contentId,
    before: { visibility: content.visibility },
    after: {
      visibility: input.visibility,
      caseId: input.caseId,
      decisionId: input.decisionId,
      ...(input.appealId ? { appealId: input.appealId } : {}),
    },
    policyVersion: input.policyVersion,
    requestId: input.requestId,
  });
  return { before: content.visibility, after: input.visibility, changed: true };
}
