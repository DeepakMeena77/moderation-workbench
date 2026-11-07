import type { ActorType, CaseStatus, ContentType, Visibility } from '@prisma/client';
import type { Actor } from '../auth/session';
import { getDb } from '../db';
import { AppError } from '../errors';
import { getLogger } from '../logger';
import { policyChangeSince, type PolicyChange } from '../policy/diff';
import type { ModAction } from '../policy/schema';
import { parseStoredBrief } from './appealBriefs';
import { appealability, clauseList, formatDeadline, plainAppealText, plainDecisionText } from './appeals';
import { parseAiDetail, parseRecommendation, parseRuleFindings } from './cases';
import { clauseTitlesByVersion, isStaff } from './content';

// The moderation history of one item (CNT-4, SEC-2, 03 sec. 6.4): one timeline of the item's creation, analyses,
// decisions, appeals and outcomes. Staff get the full detail (AI status, model, tokens, cost, deciders, rationales,
// report reasons, audit events). The author gets plain language built here, on the server, so the response itself
// never carries AI internals, staff names or anything about reporters. Any other author gets 403.

export type HistoryView = 'author' | 'staff';

export type HistoryEventKind =
  | 'created'
  | 'reported'
  | 'analysis'
  | 'decision'
  | 'appeal'
  | 'appeal_assigned'
  | 'appeal_brief'
  | 'appeal_resolved'
  | 'visibility';

export interface HistoryEvent {
  id: string;
  at: string;
  kind: HistoryEventKind;
  title: string;
  /** Plain sentences, rendered as text. */
  lines: string[];
  action: ModAction | null;
  policyVersion: number | null;
  /** Staff only: label and value pairs (AI status, model, tokens, cost...). Never present in the author view. */
  facts?: Array<{ label: string; value: string }>;
  /** Decisions only (POL-4): "Policy changed since this decision (v1 -> v2)" when a newer version is active. */
  policyChange?: PolicyChange;
}

export interface HistoryAuditEvent {
  id: string;
  at: string;
  action: string;
  actorType: ActorType;
  actorName: string | null;
  entityType: string;
}

export interface ContentHistory {
  view: HistoryView;
  content: {
    id: string;
    type: ContentType;
    body: string;
    createdAt: string;
    visibility: Visibility;
    /** Staff only; the author knows it is theirs. */
    authorName: string | null;
  };
  caseStatus: CaseStatus | null;
  /** Oldest first. */
  events: HistoryEvent[];
  /** Staff only: every audit event of the item, its case, analyses, decisions and appeals. */
  auditEvents?: HistoryAuditEvent[];
}

const withPolicyChange = (change: PolicyChange | null) => (change ? { policyChange: change } : {});

const KIND_ORDER: Record<HistoryEventKind, number> = {
  created: 0,
  reported: 1,
  analysis: 2,
  decision: 3,
  visibility: 4,
  appeal: 5,
  appeal_assigned: 6,
  appeal_brief: 7,
  appeal_resolved: 8,
};

const ANALYSIS_REASON_PLAIN: Record<string, (version: number) => string> = {
  initial: () => 'Automatic checks ran when you posted.',
  report: () => 'Checked again after it was reported.',
  reanalyze: () => 'A moderator asked for a fresh check.',
  policy_change: (v) => `Checked again because the policy changed to v${v}.`,
};

const DECISION_TITLE: Record<ModAction, string> = {
  none: 'Reviewed - no action',
  label: 'Labelled',
  limit: 'Limited',
  remove: 'Removed',
};

const OUTCOME_TITLE = { uphold: 'Appeal upheld', overturn: 'Appeal overturned', modify: 'Decision changed on appeal' };

const fact = (label: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? [] : [{ label, value: String(value) }];

export async function getContentHistory(
  actor: Actor,
  contentId: string,
  now: Date = new Date(),
): Promise<ContentHistory> {
  const db = getDb();
  const content = await db.content.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      type: true,
      body: true,
      createdAt: true,
      visibility: true,
      authorId: true,
      author: { select: { name: true } },
    },
  });
  if (!content) throw new AppError('NOT_FOUND', 'This item does not exist.');

  const staff = isStaff(actor);
  // SEC-2: an author may read only their own item's history.
  if (!staff && content.authorId !== actor.id) {
    getLogger().warn({ event: 'access.denied', userId: actor.id, contentId, reason: 'not_author' });
    throw new AppError('FORBIDDEN', 'You can only see the history of your own content.');
  }

  const [kase, titles, activePolicy] = await Promise.all([
    db.case.findUnique({
      where: { contentId },
      select: {
        id: true,
        status: true,
        analyses: {
          orderBy: { seq: 'asc' },
          select: {
            id: true,
            seq: true,
            policyVersion: true,
            reason: true,
            ruleFindings: true,
            aiFindings: true,
            recommendation: true,
            aiStatus: true,
            createdAt: true,
            aiRun: {
              select: { model: true, inputTokens: true, outputTokens: true, thinkingTokens: true, costUsd: true },
            },
          },
        },
        decisions: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kind: true,
            recommendedAction: true,
            finalAction: true,
            clauseCodes: true,
            reasonCategory: true,
            rationale: true,
            policyVersion: true,
            createdAt: true,
            decider: { select: { name: true } },
            analysis: { select: { seq: true } },
          },
        },
        appeals: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            decisionId: true,
            statement: true,
            evidenceLinks: true,
            evidenceNote: true,
            status: true,
            outcome: true,
            finalAction: true,
            rationale: true,
            createdAt: true,
            resolvedAt: true,
            brief: true,
            briefAiRunId: true,
            assignedReviewer: { select: { name: true } },
            resolver: { select: { name: true } },
            briefAiRun: { select: { model: true, costUsd: true, createdAt: true } },
          },
        },
      },
    }),
    clauseTitlesByVersion(),
    db.policy.findFirst({ where: { status: 'active' }, select: { version: true } }),
  ]);
  // POL-4: a decision keeps its policy version; when a newer one is active, both views say so.
  const changeSince = (version: number) => (activePolicy ? policyChangeSince(version, activePolicy.version) : null);

  const titlesFor = (version: number) => titles.get(version) ?? new Map<string, string>();
  const noun = content.type === 'post' ? 'post' : 'comment';
  const events: HistoryEvent[] = [
    {
      id: `content:${content.id}`,
      at: content.createdAt.toISOString(),
      kind: 'created',
      title: staff ? `${content.type === 'post' ? 'Post' : 'Comment'} created` : `You wrote this ${noun}`,
      lines: staff ? [`By ${content.author.name}, ${content.body.length} characters.`] : [],
      action: null,
      policyVersion: null,
    },
  ];

  for (const a of kase?.analyses ?? []) {
    const rec = parseRecommendation(a.recommendation);
    if (staff) {
      const findings = parseRuleFindings(a.ruleFindings).length + (parseAiDetail(a.aiFindings)?.findings.length ?? 0);
      events.push({
        id: `analysis:${a.id}`,
        at: a.createdAt.toISOString(),
        kind: 'analysis',
        title: `Analysis v${a.seq} (${a.reason.replace('_', ' ')})`,
        lines: [
          `Suggested action: ${rec.action}${rec.clauseCodes.length > 0 ? ` under ${rec.clauseCodes.join(', ')}` : ''}.`,
          ...(rec.needsHuman && rec.reasons.length > 0 ? [`Why a human must decide: ${rec.reasons.join('; ')}`] : []),
          ...(rec.autoClear ? ['Auto-cleared: no findings, no reports, confident AI result.'] : []),
        ],
        action: rec.action,
        policyVersion: a.policyVersion,
        facts: [
          ...fact('Findings', findings),
          ...fact('Severity', rec.severity),
          ...fact('Confidence', rec.confidence === null ? null : rec.confidence.toFixed(2)),
          ...fact('AI status', a.aiStatus),
          ...fact('Model', a.aiRun?.model),
          ...fact(
            'Tokens in / out / thinking',
            a.aiRun ? `${a.aiRun.inputTokens} / ${a.aiRun.outputTokens} / ${a.aiRun.thinkingTokens}` : null,
          ),
          ...fact('Estimated cost', a.aiRun ? `$${Number(a.aiRun.costUsd).toFixed(6)}` : null),
        ],
      });
    } else {
      events.push({
        id: `analysis:${a.id}`,
        at: a.createdAt.toISOString(),
        kind: 'analysis',
        title: `Checked against policy v${a.policyVersion}`,
        lines: [
          ANALYSIS_REASON_PLAIN[a.reason]?.(a.policyVersion) ?? 'Automatic checks ran.',
          rec.autoClear ? 'No problems were found.' : 'Sent to a moderator for review.',
        ],
        action: null,
        policyVersion: a.policyVersion,
      });
    }
  }

  const decisions = kase?.decisions ?? [];
  const latestDecisionId = decisions.at(-1)?.id ?? null;
  const appealsByDecision = new Map((kase?.appeals ?? []).map((ap) => [ap.decisionId, ap]));
  for (const d of decisions) {
    const names = titlesFor(d.policyVersion);
    if (staff) {
      events.push({
        id: `decision:${d.id}`,
        at: d.createdAt.toISOString(),
        kind: 'decision',
        title: `Decision: ${d.kind} the recommendation`,
        lines: [
          `${d.decider.name} decided on analysis v${d.analysis.seq}. AI suggestion: ${d.recommendedAction}; final: ${d.finalAction}.`,
          ...(d.clauseCodes.length > 0 ? [`Clauses: ${clauseList(d.clauseCodes, names)}.`] : []),
          ...(d.reasonCategory ? [`Reason: ${d.reasonCategory.replace(/_/g, ' ')}.`] : []),
          ...(d.rationale ? [`Rationale: ${d.rationale}`] : []),
        ],
        action: d.finalAction,
        policyVersion: d.policyVersion,
        ...withPolicyChange(changeSince(d.policyVersion)),
      });
    } else {
      const window = appealability(
        {
          finalAction: d.finalAction,
          createdAt: d.createdAt,
          isLatest: d.id === latestDecisionId,
          hasAppeal: appealsByDecision.has(d.id),
        },
        kase?.status ?? 'resolved',
        now,
      );
      events.push({
        id: `decision:${d.id}`,
        at: d.createdAt.toISOString(),
        kind: 'decision',
        title: DECISION_TITLE[d.finalAction],
        lines: [
          plainDecisionText(d, names),
          ...(window.canAppeal && window.until
            ? [`You can appeal until ${formatDeadline(new Date(window.until))}.`]
            : []),
        ],
        action: d.finalAction,
        policyVersion: d.policyVersion,
        ...withPolicyChange(changeSince(d.policyVersion)),
      });
    }
  }

  for (const ap of kase?.appeals ?? []) {
    events.push({
      id: `appeal:${ap.id}`,
      at: ap.createdAt.toISOString(),
      kind: 'appeal',
      title: staff ? 'Appeal received' : 'You appealed',
      lines: [
        `${staff ? 'Statement' : 'Your statement'}: ${ap.statement}`,
        ...(ap.evidenceLinks.length > 0 ? [`Links: ${ap.evidenceLinks.join(', ')}`] : []),
        ...(ap.evidenceNote ? [`Note: ${ap.evidenceNote}`] : []),
        ...(staff ? [] : ['A senior moderator who did not make the decision will review it.']),
      ],
      action: null,
      policyVersion: null,
    });
    if (staff) {
      events.push({
        id: `appeal_assigned:${ap.id}`,
        at: ap.createdAt.toISOString(),
        kind: 'appeal_assigned',
        title: ap.assignedReviewer ? `Assigned to ${ap.assignedReviewer.name}` : 'No eligible reviewer',
        lines: ap.assignedReviewer
          ? ['Routed to the least-loaded senior moderator who did not make the decision.']
          : ['No senior moderator other than the decider exists. The appeal waits unassigned.'],
        action: null,
        policyVersion: null,
      });
      const brief = parseStoredBrief(ap.brief);
      if (ap.briefAiRunId && brief && ap.briefAiRun) {
        events.push({
          id: `appeal_brief:${ap.id}`,
          at: ap.briefAiRun.createdAt.toISOString(),
          kind: 'appeal_brief',
          title: brief.aiStatus === 'ok' ? 'AI appeal summary written' : 'AI appeal summary unavailable',
          lines: [
            brief.aiStatus === 'ok'
              ? `${brief.newPoints.length} new points, ${brief.disputedFindings.length} disputed findings. The summary does not recommend an outcome.`
              : (brief.unavailableReason ?? 'AI unavailable'),
          ],
          action: null,
          policyVersion: null,
          facts: [
            ...fact('AI status', brief.aiStatus),
            ...fact('Model', ap.briefAiRun.model),
            ...fact('Estimated cost', `$${Number(ap.briefAiRun.costUsd).toFixed(6)}`),
          ],
        });
      }
    }
    if (ap.status === 'resolved' && ap.outcome && ap.resolvedAt) {
      events.push({
        id: `appeal_resolved:${ap.id}`,
        at: ap.resolvedAt.toISOString(),
        kind: 'appeal_resolved',
        title: OUTCOME_TITLE[ap.outcome],
        lines: staff
          ? [
              `${ap.resolver?.name ?? 'A senior moderator'} resolved the appeal: ${ap.outcome}, final action ${ap.finalAction}.`,
              ...(ap.rationale ? [`Rationale: ${ap.rationale}`] : []),
            ]
          : [plainAppealText(ap)],
        action: ap.finalAction,
        policyVersion: null,
      });
    }
  }

  // Staff: visibility changes and the raw audit trail, from the audit log itself.
  let auditEvents: HistoryAuditEvent[] | undefined;
  if (staff) {
    const entityIds = [
      content.id,
      ...(kase ? [kase.id] : []),
      ...(kase?.analyses.map((a) => a.id) ?? []),
      ...decisions.map((d) => d.id),
      ...(kase?.appeals.map((ap) => ap.id) ?? []),
    ];
    const rows = await db.auditEvent.findMany({
      where: { entityId: { in: entityIds } },
      orderBy: { id: 'asc' },
      select: { id: true, at: true, action: true, actorType: true, actorId: true, entityType: true, after: true },
    });
    const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
    const actors = new Map(
      (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [
        u.id,
        u.name,
      ]),
    );
    auditEvents = rows.map((r) => ({
      id: r.id.toString(),
      at: r.at.toISOString(),
      action: r.action,
      actorType: r.actorType,
      actorName: r.actorId ? (actors.get(r.actorId) ?? null) : null,
      entityType: r.entityType,
    }));
    for (const r of rows) {
      if (r.action !== 'visibility.changed') continue;
      const after = (typeof r.after === 'object' && r.after !== null ? r.after : {}) as Record<string, unknown>;
      events.push({
        id: `audit:${r.id.toString()}`,
        at: r.at.toISOString(),
        kind: 'visibility',
        title: `Visibility changed to ${String(after.visibility ?? 'unknown')}`,
        lines: [
          `By ${r.actorId ? (actors.get(r.actorId) ?? 'a moderator') : 'the system'}${after.appealId ? ', on appeal' : ''}.`,
        ],
        action: null,
        policyVersion: null,
      });
    }
    // Reports: reasons and times only. Reporter identities stay out of the history (CNT-3e).
    const reports = await db.report.findMany({
      where: { contentId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, reason: true, createdAt: true },
    });
    for (const rep of reports) {
      events.push({
        id: `report:${rep.id}`,
        at: rep.createdAt.toISOString(),
        kind: 'reported',
        title: 'Reported',
        lines: [`Reason: ${rep.reason.replace('_', ' ')}.`],
        action: null,
        policyVersion: null,
      });
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return {
    view: staff ? 'staff' : 'author',
    content: {
      id: content.id,
      type: content.type,
      body: content.body,
      createdAt: content.createdAt.toISOString(),
      visibility: content.visibility,
      authorName: staff ? content.author.name : null,
    },
    caseStatus: kase?.status ?? null,
    events,
    ...(auditEvents ? { auditEvents } : {}),
  };
}
