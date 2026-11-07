import { Prisma, type CaseStatus } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { analyzeDedupeKey, enqueue } from '../jobs/queue';
import { getLogger } from '../logger';
import { computePriority } from '../moderation/priority';
import type { Severity } from '../policy/schema';
import { append } from './audit';
import { isStaff } from './content';
import { getActivePolicy } from './policy';

// User reports (CNT-3). A report joins the item's case and raises its priority, and queues a new analysis
// with the report as context. Case transitions (01 sec. 4): auto_cleared -> awaiting_review;
// resolved / appeal_resolved -> pending_analysis; pending_analysis, awaiting_review and appealed keep
// their status. The reporter's identity is stored for staff but never shown to the author (CNT-3e).

export const REPORT_REASONS = [
  'harassment',
  'threat',
  'self_harm',
  'hate',
  'private_info',
  'spam',
  'scam',
  'other',
] as const;

export const MAX_REPORT_NOTE_CHARS = 500;

export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS, { errorMap: () => ({ message: 'Choose a reason.' }) }),
  note: z
    .string()
    .trim()
    .max(MAX_REPORT_NOTE_CHARS, `Keep the note under ${MAX_REPORT_NOTE_CHARS} characters.`)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

const ALREADY_REPORTED = "You've already reported this.";

function statusAfterReport(current: CaseStatus): CaseStatus {
  switch (current) {
    case 'auto_cleared':
      return 'awaiting_review';
    case 'resolved':
    case 'appeal_resolved':
      return 'pending_analysis';
    default:
      return current;
  }
}

const recommendationShape = z
  .object({
    severity: z.enum(['low', 'medium', 'high']).nullable().optional(),
    alwaysEscalate: z.boolean().optional(),
  })
  .passthrough();

export async function createReport(
  actor: Actor,
  contentId: string,
  input: ReportInput,
  requestId: string,
): Promise<{ reported: true }> {
  const db = getDb();
  const content = await db.content.findUnique({
    where: { id: contentId },
    select: { id: true, authorId: true, visibility: true },
  });
  const canSee = content && (content.visibility !== 'removed' || content.authorId === actor.id || isStaff(actor));
  if (!content || !canSee) throw new AppError('NOT_FOUND', 'This content does not exist or is no longer available.');
  if (content.authorId === actor.id) throw new AppError('FORBIDDEN', "You can't report your own content.");

  const existing = await db.report.findUnique({
    where: { contentId_reporterId: { contentId, reporterId: actor.id } },
    select: { id: true },
  });
  if (existing) throw new AppError('ALREADY_REPORTED', ALREADY_REPORTED);

  try {
    const outcome = await db.$transaction(async (tx) => {
      const policy = await getActivePolicy(tx);
      const policyVersion = policy?.version ?? null;
      const report = await tx.report.create({
        data: { contentId, reporterId: actor.id, reason: input.reason, note: input.note ?? null },
        select: { id: true },
      });

      // Lock the case row so concurrent reports count correctly. Every item gets a case when it is created;
      // the fallback opens one if an older row has none.
      await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "contentId" = ${contentId} FOR UPDATE`;
      let kase = await tx.case.findUnique({
        where: { contentId },
        select: { id: true, status: true, reportCount: true, currentAnalysisId: true },
      });
      let opened = false;
      if (!kase) {
        kase = await tx.case.create({
          data: { contentId, status: 'pending_analysis', trigger: 'report' },
          select: { id: true, status: true, reportCount: true, currentAnalysisId: true },
        });
        opened = true;
      }

      const current = kase.currentAnalysisId
        ? await tx.analysis.findUnique({ where: { id: kase.currentAnalysisId }, select: { recommendation: true } })
        : null;
      const recommendation = recommendationShape.safeParse(current?.recommendation ?? {});
      const severity: Severity | null = recommendation.success ? (recommendation.data.severity ?? null) : null;
      const reportCount = kase.reportCount + 1;
      const status = statusAfterReport(kase.status);
      // A reported case always needs a human (AI-6), so needsHuman is true here.
      const priority = computePriority({
        severity,
        reportCount,
        needsHuman: true,
        alwaysEscalate: recommendation.success ? (recommendation.data.alwaysEscalate ?? false) : false,
      });
      await tx.case.update({
        where: { id: kase.id },
        data: {
          reportCount,
          status,
          priority,
          ...(status === 'pending_analysis' && kase.status !== 'pending_analysis' ? { trigger: 'report' } : {}),
        },
      });
      await enqueue(tx, {
        type: 'analyze',
        payload: { caseId: kase.id, reason: 'report' },
        dedupeKey: analyzeDedupeKey(kase.id, 'report', policyVersion, report.id),
      });

      const common = { actorId: actor.id, actorType: 'human' as const, policyVersion, requestId };
      await append(tx, {
        ...common,
        action: 'report.created',
        entityType: 'report',
        entityId: report.id,
        after: { contentId, caseId: kase.id, reason: input.reason, hasNote: input.note !== undefined },
      });
      if (opened) {
        await append(tx, {
          ...common,
          action: 'case.opened',
          entityType: 'case',
          entityId: kase.id,
          after: { contentId, status, trigger: 'report' },
        });
      } else if (status !== kase.status) {
        await append(tx, {
          ...common,
          action: 'case.reopened',
          entityType: 'case',
          entityId: kase.id,
          before: { status: kase.status },
          after: { status, trigger: 'report', reportCount },
        });
      }
      return { reportId: report.id, caseId: kase.id, status, priority };
    });
    getLogger().info({ event: 'report.created', requestId, userId: actor.id, contentId, ...outcome });
    return { reported: true };
  } catch (error) {
    // Two reports from the same user racing each other: the unique index decides (CNT-3c).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('ALREADY_REPORTED', ALREADY_REPORTED);
    }
    throw error;
  }
}
