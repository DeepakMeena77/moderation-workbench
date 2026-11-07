import type { AppealOutcome, AppealStatus, CaseStatus, ContentType, Prisma, Visibility } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { analyzeDedupeKey, enqueue } from '../jobs/queue';
import { contentFingerprint, getLogger } from '../logger';
import { clausesSchema, type ModAction } from '../policy/schema';
import { appealability, plainAppealText, plainDecisionText, type Appealability } from './appeals';
import { append, type Tx } from './audit';
import { getActivePolicy } from './policy';
import { formatWait, type RateLimitRule } from './rateLimit';

// Posts, comments and the feed (CNT-1, CNT-2, CNT-5). Creating content, its case, its analyse job and the
// audit events is one transaction (AUD-1): either all of it exists or none of it does.

export const MAX_BODY_CHARS = 2000;

/** SEC-4: posts and comments together, 10 per minute per user, counted from the user's own rows. */
export const POSTING_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };

const thousands = (n: number) => n.toLocaleString('en-US');

// CNT-1: 1-2,000 characters of plain text after trimming. The messages are the UI copy (03 sec. 7).
export const contentInputSchema = z.object({
  body: z
    .string({ required_error: 'Write at least 1 character.', invalid_type_error: 'Write at least 1 character.' })
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Write at least 1 character.' });
      } else if (value.length > MAX_BODY_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Keep it under ${thousands(MAX_BODY_CHARS)} characters (${thousands(value.length)}).`,
        });
      }
    }),
});

export type ContentInput = z.infer<typeof contentInputSchema>;

export interface CreatedContent {
  id: string;
  type: ContentType;
  caseId: string;
  /** The policy the content will be checked against, for "Posted - being checked against policy v1". */
  policyVersion: number | null;
}

const STAFF_ROLES = new Set(['moderator', 'senior_moderator', 'admin']);
export const isStaff = (actor: Actor) => STAFF_ROLES.has(actor.role);

async function enforcePostingLimit(tx: Tx, authorId: string, now: Date): Promise<void> {
  const since = new Date(now.getTime() - POSTING_LIMIT.windowMs);
  const recent = await tx.content.findMany({
    where: { authorId, createdAt: { gt: since } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: POSTING_LIMIT.limit,
  });
  if (recent.length < POSTING_LIMIT.limit) return;
  const oldest = recent[0]?.createdAt ?? now;
  const retryAfterS = Math.max(1, Math.ceil((oldest.getTime() + POSTING_LIMIT.windowMs - now.getTime()) / 1000));
  throw new AppError('RATE_LIMITED', `You're posting quickly. Try again in ${formatWait(retryAfterS)}.`, {
    retryAfterS,
  });
}

async function createContent(
  actor: Actor,
  input: { type: ContentType; body: string; parentId: string | null },
  requestId: string,
): Promise<CreatedContent> {
  const created = await getDb().$transaction(async (tx) => {
    await enforcePostingLimit(tx, actor.id, new Date());
    const policy = await getActivePolicy(tx);
    const policyVersion = policy?.version ?? null;

    const content = await tx.content.create({
      data: { type: input.type, body: input.body, authorId: actor.id, parentId: input.parentId },
      select: { id: true, type: true },
    });
    const kase = await tx.case.create({
      data: { contentId: content.id, status: 'pending_analysis', trigger: 'new_content' },
      select: { id: true },
    });
    await enqueue(tx, {
      type: 'analyze',
      payload: { caseId: kase.id, reason: 'initial' },
      dedupeKey: analyzeDedupeKey(kase.id, 'initial', policyVersion, content.id),
    });
    const common = { actorId: actor.id, actorType: 'human' as const, policyVersion, requestId };
    await append(tx, {
      ...common,
      action: 'content.created',
      entityType: 'content',
      entityId: content.id,
      after: { type: content.type, parentId: input.parentId, length: input.body.length },
    });
    await append(tx, {
      ...common,
      action: 'case.opened',
      entityType: 'case',
      entityId: kase.id,
      after: { contentId: content.id, status: 'pending_analysis', trigger: 'new_content' },
    });
    return { id: content.id, type: content.type, caseId: kase.id, policyVersion };
  });
  getLogger().info({
    event: 'content.created',
    requestId,
    userId: actor.id,
    contentId: created.id,
    type: created.type,
    content: contentFingerprint(input.body),
  });
  return created;
}

export function createPost(actor: Actor, input: ContentInput, requestId: string): Promise<CreatedContent> {
  return createContent(actor, { type: 'post', body: input.body, parentId: null }, requestId);
}

/** Visibility filter for one viewer (CNT-5): removed items are hidden from everyone but their author and staff. */
function visibleTo(actor: Actor): Prisma.ContentWhereInput {
  if (isStaff(actor)) return {};
  return { OR: [{ visibility: { not: 'removed' } }, { authorId: actor.id }] };
}

export async function createComment(
  actor: Actor,
  postId: string,
  input: ContentInput,
  requestId: string,
): Promise<CreatedContent> {
  const parent = await getDb().content.findFirst({
    where: { id: postId, type: 'post', ...visibleTo(actor) },
    select: { id: true },
  });
  if (!parent) throw new AppError('NOT_FOUND', 'This post does not exist or is no longer available.');
  return createContent(actor, { type: 'comment', body: input.body, parentId: parent.id }, requestId);
}

// --- Feed ---

export interface FeedItem {
  id: string;
  type: ContentType;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  visibility: Visibility;
  isOwn: boolean;
  /** The viewer's own report only; other reporters are never exposed (CNT-3e). */
  viewerReported: boolean;
  /** For the author: the checks have not finished yet ("Analysing..." tag, 03 sec. 6.2). */
  analysing: boolean;
  /**
   * Clauses behind a label, limit or removal, from the latest human decision, and (for the author only) the
   * appeal deadline while an appeal is still possible (CNT-5, APP-1).
   */
  moderation: { clauseCodes: string[]; appealUntil: string | null };
}

export interface FeedPost extends FeedItem {
  comments: FeedItem[];
}

export interface FeedPage {
  items: FeedPost[];
  nextCursor: string | null;
}

export const feedQuerySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const MAX_COMMENTS_PER_POST = 100;

const itemSelect = {
  id: true,
  type: true,
  body: true,
  createdAt: true,
  visibility: true,
  author: { select: { id: true, name: true } },
  case: {
    select: {
      status: true,
      decisions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { finalAction: true, clauseCodes: true, createdAt: true, appeal: { select: { id: true } } },
      },
    },
  },
} satisfies Prisma.ContentSelect;

type ItemRow = Prisma.ContentGetPayload<{ select: typeof itemSelect }>;

export async function listFeed(actor: Actor, query: z.infer<typeof feedQuerySchema>): Promise<FeedPage> {
  const db = getDb();
  const visible = visibleTo(actor);
  const rows = await db.content.findMany({
    where: { type: 'post', ...visible },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      ...itemSelect,
      comments: {
        where: visible,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_COMMENTS_PER_POST,
        select: itemSelect,
      },
    },
  });
  const page = rows.slice(0, query.limit);
  const ids = page.flatMap((post) => [post.id, ...post.comments.map((comment) => comment.id)]);
  const reported = new Set(
    (
      await db.report.findMany({
        where: { reporterId: actor.id, contentId: { in: ids } },
        select: { contentId: true },
      })
    ).map((report) => report.contentId),
  );

  const now = new Date();
  const toItem = (row: ItemRow): FeedItem => {
    const isOwn = row.author.id === actor.id;
    const decision = row.case?.decisions[0];
    const window =
      isOwn && decision && row.case
        ? appealability(
            {
              finalAction: decision.finalAction,
              createdAt: decision.createdAt,
              isLatest: true,
              hasAppeal: decision.appeal !== null,
            },
            row.case.status,
            now,
          )
        : null;
    return {
      id: row.id,
      type: row.type,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
      visibility: row.visibility,
      isOwn,
      viewerReported: reported.has(row.id),
      analysing: isOwn && row.case?.status === 'pending_analysis',
      moderation: {
        clauseCodes: row.visibility !== 'visible' && decision ? decision.clauseCodes : [],
        appealUntil: window?.canAppeal ? window.until : null,
      },
    };
  };

  return {
    items: page.map((post) => ({ ...toItem(post), comments: post.comments.map(toItem) })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

// --- My content (03 sec. 6.3, APP-1, APP-5) ---

export const myContentQuerySchema = feedQuerySchema;

export interface MyContentItem {
  id: string;
  type: ContentType;
  body: string;
  createdAt: string;
  visibility: Visibility;
  caseStatus: CaseStatus | null;
  decision: {
    id: string;
    finalAction: ModAction;
    clauses: Array<{ code: string; title: string | null }>;
    decidedAt: string;
    /** Plain words: "A moderator limited this under HAR-1 (Harassment)." */
    summary: string;
  } | null;
  appeal: {
    id: string;
    status: AppealStatus;
    outcome: AppealOutcome | null;
    finalAction: ModAction | null;
    createdAt: string;
    resolvedAt: string | null;
    summary: string;
  } | null;
  /** Whether the latest decision can be appealed now, and until when (APP-1). null before any decision. */
  appealability: Appealability | null;
}

export interface MyContentPage {
  items: MyContentItem[];
  nextCursor: string | null;
}

/** Code -> title for every policy version, for clause names in plain-language text. Versions are few. */
export async function clauseTitlesByVersion(): Promise<Map<number, Map<string, string>>> {
  const policies = await getDb().policy.findMany({ select: { version: true, clauses: true } });
  return new Map(
    policies.map((p) => [p.version, new Map(clausesSchema.parse(p.clauses).map((c) => [c.code, c.title]))]),
  );
}

/** The author's own items, newest first, with the latest decision and its appeal (SEC-2: own items only). */
export async function listMyContent(
  actor: Actor,
  query: z.infer<typeof myContentQuerySchema>,
  now: Date = new Date(),
): Promise<MyContentPage> {
  const [rows, titles] = await Promise.all([
    getDb().content.findMany({
      where: { authorId: actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        body: true,
        createdAt: true,
        visibility: true,
        case: {
          select: {
            status: true,
            decisions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                finalAction: true,
                clauseCodes: true,
                policyVersion: true,
                createdAt: true,
                appeal: {
                  select: {
                    id: true,
                    status: true,
                    outcome: true,
                    finalAction: true,
                    createdAt: true,
                    resolvedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    clauseTitlesByVersion(),
  ]);
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((row): MyContentItem => {
      const decision = row.case?.decisions[0] ?? null;
      const names = (decision && titles.get(decision.policyVersion)) || new Map<string, string>();
      const appeal = decision?.appeal ?? null;
      return {
        id: row.id,
        type: row.type,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        visibility: row.visibility,
        caseStatus: row.case?.status ?? null,
        decision: decision
          ? {
              id: decision.id,
              finalAction: decision.finalAction,
              clauses: decision.clauseCodes.map((code) => ({ code, title: names.get(code) ?? null })),
              decidedAt: decision.createdAt.toISOString(),
              summary: plainDecisionText(decision, names),
            }
          : null,
        appeal: appeal
          ? {
              id: appeal.id,
              status: appeal.status,
              outcome: appeal.outcome,
              finalAction: appeal.finalAction,
              createdAt: appeal.createdAt.toISOString(),
              resolvedAt: appeal.resolvedAt?.toISOString() ?? null,
              summary: plainAppealText(appeal),
            }
          : null,
        appealability:
          decision && row.case
            ? appealability(
                {
                  finalAction: decision.finalAction,
                  createdAt: decision.createdAt,
                  isLatest: true,
                  hasAppeal: appeal !== null,
                },
                row.case.status,
                now,
              )
            : null,
      };
    }),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
