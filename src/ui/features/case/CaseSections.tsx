'use client';

import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import PolicyRounded from '@mui/icons-material/PolicyRounded';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { useId, useState, type ReactNode } from 'react';
import type { AiRun, Analysis, CaseDetail, Clause, DecisionSummary, Finding } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfidenceMeter } from '../../components/ConfidenceMeter';
import { HighlightedText, type Highlight } from '../../components/HighlightedText';
import {
  ACTION_LABEL,
  ActionTag,
  AI_STATUS_LABEL,
  AiStateTag,
  ClauseTag,
  EvidenceTag,
  InsufficientContextTag,
  PolicyVersionTag,
  SeverityTag,
} from '../../components/ModerationTags';
import { Dot, Tag } from '../../components/Tag';
import { layout, m3, monoSx } from '../../theme/theme';
import { relativeTime } from '../feed/format';
import { REASON_LABEL } from './decisionForm';

// The sections of the case page (03 sec. 6.6). Every user and AI string is rendered as plain text (SEC-3).
// AI output is labelled as such, and the human outcome is shown with the person and the time (03 sec. 1).

export const AI_PENDING = 'AI review pending or unavailable';

const RULE_LABEL: Record<string, string> = {
  keyword: 'keyword rule',
  pattern: 'pattern rule',
  links: 'link-count rule',
  contact: 'contact-details rule',
  repeat: 'repeated-text rule',
};

function Nested({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box
      data-ui="section"
      role={label ? 'group' : undefined}
      aria-label={label}
      sx={(t) => ({
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 3,
        borderRadius: `${layout.controlRadius}px`,
        border: `1px solid ${m3(t).border}`,
        minWidth: 0,
      })}
    >
      {children}
    </Box>
  );
}

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Typography id={id} variant="h3" component="h2">
      {children}
    </Typography>
  );
}

function TagRow({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>{children}</Box>;
}

/** Highlights for the content text: rule matches and verified AI quotes, never interpretations (03 sec. 2.3). */
export function evidenceHighlights(analysis: Analysis | null, clauses: readonly Clause[]): Highlight[] {
  if (!analysis) return [];
  const titles = new Map(clauses.map((c) => [c.code, `${c.code} - ${c.title}`]));
  const findings = [
    ...analysis.ruleFindings,
    ...(analysis.ai?.findings ?? []).filter((f) => f.evidenceType === 'confirmed'),
  ];
  return findings.flatMap((f) =>
    f.quotes.flatMap((q) =>
      q.start !== null && q.end !== null
        ? [{ start: q.start, end: q.end, code: f.clauseCode, title: titles.get(f.clauseCode) ?? f.clauseCode }]
        : [],
    ),
  );
}

export function ContentCard({ detail }: { detail: CaseDetail }) {
  const headingId = useId();
  const clauses = detail.policy?.clauses ?? [];
  // The page title already says whose post it is; the region keeps that name so it can be found by it.
  const name = `${detail.content.type === 'post' ? 'Post' : 'Comment'} by ${detail.content.author.name}`;
  return (
    <Card component="section" aria-label={name} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <SectionTitle id={headingId}>Content</SectionTitle>
        <Typography variant="caption" color="text.secondary" component="p">
          <time dateTime={detail.content.createdAt}>{relativeTime(detail.content.createdAt)}</time>
          {' | '}visible to others as: {detail.content.visibility}
        </Typography>
      </Box>
      {detail.content.parent ? (
        <Nested label="Parent post">
          <Typography variant="h4" component="p">
            In reply to {detail.content.parent.authorName}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {detail.content.parent.body}
          </Typography>
        </Nested>
      ) : null}
      <HighlightedText text={detail.content.body} highlights={evidenceHighlights(detail.analysis, clauses)} />
      {detail.reportReasons.length > 0 ? (
        <Box>
          <Typography variant="h4" component="p" sx={{ mb: 1 }}>
            Reports ({detail.reportCount})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {detail.reportReasons.map((r) => `${r.reason.replace('_', ' ')} x${r.count}`).join(', ')}
          </Typography>
        </Box>
      ) : null}
    </Card>
  );
}

function ClauseText({ clause }: { clause: Clause | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!clause) return null;
  return (
    <Box>
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none' }} />}
        sx={(t) => ({ ml: -3, color: m3(t).onSurfaceVariant, fontWeight: 400 })}
      >
        {open ? 'Hide clause text' : `Clause: ${clause.title}`}
      </Button>
      <Collapse in={open} id={id}>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {clause.text}
        </Typography>
      </Collapse>
    </Box>
  );
}

/**
 * Where the recommendation's severity comes from: the first finding at that severity, rules before AI, for example
 * "THR-1 rule" or "HAR-1 AI". null when there is no severity or no finding carries it.
 */
export function severitySource(analysis: Pick<Analysis, 'ruleFindings' | 'ai' | 'recommendation'>): string | null {
  const severity = analysis.recommendation.severity;
  if (!severity) return null;
  const rule = analysis.ruleFindings.find((f) => f.severity === severity);
  if (rule) return `${rule.clauseCode} rule`;
  const ai = (analysis.ai?.findings ?? []).find((f) => f.severity === severity);
  if (ai) return `${ai.clauseCode} ${ai.evidenceType === 'confirmed' ? 'AI' : 'AI interpretation'}`;
  return null;
}

/** "Rule - keyword" for a rule match, "AI" for a quote the model gave and the server found in the text. */
export function evidenceSourceLabel(finding: Pick<Finding, 'source' | 'ruleId'>): string {
  return finding.source === 'rule' ? `Rule - ${finding.ruleId ?? 'match'}` : 'AI';
}

/** "chars 44-61": where the quote sits in the content text, so a moderator can check it; null when unknown. */
export function charRangeLabel(quote: Finding['quotes'][number]): string | null {
  return quote.start !== null && quote.end !== null ? `chars ${quote.start}-${quote.end}` : null;
}

// Where a confirmed quote comes from and where it sits in the text (03 sec. 6.6).
function QuoteSource({ finding, quote }: { finding: Finding; quote: Finding['quotes'][number] }) {
  const range = charRangeLabel(quote);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      <Tag label={evidenceSourceLabel(finding)} mono />
      {range ? (
        <Typography variant="caption" color="text.secondary" sx={monoSx}>
          {range}
        </Typography>
      ) : null}
    </Box>
  );
}

function FindingItem({ finding, clause, policyVersion }: { finding: Finding; clause?: Clause; policyVersion: number }) {
  const ruleLabel = finding.ruleId ? (RULE_LABEL[finding.ruleId] ?? `${finding.ruleId} rule`) : null;
  // Rules carry no model reasons, so their reasons are stated from what a rule is (AI-5 for every finding).
  const severityReason =
    finding.severityReason ??
    (finding.source === 'rule' ? `Default severity of ${finding.clauseCode} in policy v${policyVersion}.` : null);
  const confidenceReason =
    finding.confidenceReason ??
    (finding.source === 'rule' ? `Deterministic match: the ${ruleLabel ?? 'rule'} found the exact text.` : null);
  return (
    <Nested label={`Finding ${finding.clauseCode}`}>
      <TagRow>
        <ClauseTag code={finding.clauseCode} title={clause?.title} />
        <EvidenceTag
          kind={
            finding.source === 'rule' ? 'rule' : finding.evidenceType === 'confirmed' ? 'confirmed' : 'interpretation'
          }
        />
        <SeverityTag severity={finding.severity} />
      </TagRow>
      {finding.quotes.length > 0 ? (
        <Box component="ul" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {finding.quotes.map((q, i) => (
            <Box key={`${q.text}-${i}`} component="li" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                &quot;{q.text}&quot;
              </Typography>
              {finding.source === 'rule' || finding.evidenceType === 'confirmed' ? (
                <QuoteSource finding={finding} quote={q} />
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
      {finding.interpretation ? (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {finding.interpretation}
        </Typography>
      ) : null}
      {severityReason ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
          Severity: {severityReason}
        </Typography>
      ) : null}
      <ConfidenceMeter value={finding.confidence} reason={confidenceReason} />
      <ClauseText clause={clause} />
    </Nested>
  );
}

function FindingGroup({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="overline" component="h3" color="text.secondary">
        {title}
      </Typography>
      {children.length > 0 ? (
        children
      ) : (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      )}
    </Box>
  );
}

export function FindingsCard({ detail }: { detail: CaseDetail }) {
  const headingId = useId();
  const analysis = detail.analysis;
  if (!analysis) return null;
  const clauses = new Map((detail.policy?.clauses ?? []).map((c) => [c.code, c]));
  const ai = analysis.ai;
  const confirmed = [...analysis.ruleFindings, ...(ai?.findings ?? []).filter((f) => f.evidenceType === 'confirmed')];
  const interpretations = (ai?.findings ?? []).filter((f) => f.evidenceType === 'interpretation');
  const item = (f: Finding, i: number) => (
    <FindingItem
      key={`${f.source}-${f.clauseCode}-${i}`}
      finding={f}
      clause={clauses.get(f.clauseCode)}
      policyVersion={analysis.policyVersion}
    />
  );
  const dropped = [
    ...(ai?.invalidCitations ?? []).map(
      (code) => `Removed: ${code} is not a clause of policy v${analysis.policyVersion}.`,
    ),
    ...(ai?.unverifiedQuotes ?? []).map(
      (quote) => `Quote not found in the text, treated as interpretation: "${quote}"`,
    ),
    ...(ai?.actionLowered
      ? [
          `AI action lowered from ${ai.actionLowered.from} to ${ai.actionLowered.to} (the cited clauses do not allow it).`,
        ]
      : []),
  ];

  return (
    <Card component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionTitle id={headingId}>Findings</SectionTitle>
      <FindingGroup title="Confirmed evidence" empty="No confirmed evidence.">
        {confirmed.map(item)}
      </FindingGroup>
      <FindingGroup
        title="AI interpretation - a reading of context, not confirmed evidence"
        empty={ai ? 'No interpretations.' : `${AI_PENDING}.`}
      >
        {interpretations.map(item)}
      </FindingGroup>
      <FindingGroup title="Dropped by verification" empty={ai ? 'Nothing was dropped.' : `${AI_PENDING}.`}>
        {dropped.map((text) => (
          <Typography key={text} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {text}
          </Typography>
        ))}
      </FindingGroup>
    </Card>
  );
}

function Glance({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

const SEVERITY_WORD: Record<NonNullable<Analysis['recommendation']['severity']>, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// The recommendation (03 sec. 6.6): proposed action, severity and confidence side by side as three labelled values,
// then why (the reasons, the clauses, why a human must decide), and the policy version it was made under.
export function RecommendationCard({ detail }: { detail: CaseDetail }) {
  const headingId = useId();
  const analysis = detail.analysis;
  if (!analysis) return null;
  const rec = analysis.recommendation;
  const ai = analysis.ai;
  const confidence = rec.confidence === null ? null : Math.min(1, Math.max(0, rec.confidence));
  return (
    <Card component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="overline" component="p" color="text.secondary">
          AI + rules suggestion
        </Typography>
        <SectionTitle id={headingId}>Recommendation</SectionTitle>
      </Box>
      <Box
        component="dl"
        aria-label="Recommendation at a glance"
        sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 3 }}
      >
        <Glance label="Proposed action">
          <Typography variant="h3" component="span" sx={{ display: 'block' }}>
            {ACTION_LABEL[rec.action]}
          </Typography>
        </Glance>
        <Glance label="Severity">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Dot tone={rec.severity ?? 'low'} />
            <Typography variant="h3" component="span">
              {rec.severity ? SEVERITY_WORD[rec.severity] : 'None'}
            </Typography>
          </Box>
          {severitySource(analysis) ? (
            <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block' }}>
              from {severitySource(analysis)}
            </Typography>
          ) : null}
        </Glance>
        <Glance label="AI confidence in this result">
          <Typography variant="h3" component="span" sx={{ display: 'block' }}>
            {confidence === null ? 'None' : confidence.toFixed(2)}
          </Typography>
          <Typography variant="caption" component="span" color="text.secondary" sx={{ display: 'block' }}>
            {confidence === null ? 'AI pending' : 'Overall, for the whole result'}
          </Typography>
          <Box
            aria-hidden
            sx={(t) => ({ mt: 1, height: 4, borderRadius: '2px', backgroundColor: m3(t).border, overflow: 'hidden' })}
          >
            {confidence === null ? null : (
              <Box
                sx={(t) => ({
                  height: '100%',
                  width: `${Math.round(confidence * 100)}%`,
                  backgroundColor: m3(t).primary,
                })}
              />
            )}
          </Box>
        </Glance>
      </Box>
      <TagRow>
        <AiStateTag status={analysis.aiStatus} fallbackUsed={analysis.aiRun?.fallbackUsed ?? false} />
        {ai?.insufficientContext ? <InsufficientContextTag /> : null}
      </TagRow>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {ai?.severityReason ? (
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            Severity: {ai.severityReason}
          </Typography>
        ) : null}
        {ai?.confidenceReason ? (
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            Confidence: {ai.confidenceReason}
          </Typography>
        ) : null}
        {!ai ? (
          <Typography variant="body2" color="text.secondary">
            {AI_PENDING}. The suggestion comes from the rules alone.
          </Typography>
        ) : null}
      </Box>
      {rec.clauseCodes.length > 0 ? (
        <TagRow>
          <Typography variant="body2" color="text.secondary">
            Clauses
          </Typography>
          {rec.clauseCodes.map((code) => (
            <ClauseTag key={code} code={code} />
          ))}
        </TagRow>
      ) : null}
      {rec.needsHuman ? (
        <Nested label="Why a human must decide">
          <Typography variant="overline" component="h3" color="text.secondary">
            Why a human must decide
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rec.reasons.map((reason) => (
              <Typography key={reason} component="li" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {reason}
              </Typography>
            ))}
          </Box>
        </Nested>
      ) : null}
      <Typography
        variant="caption"
        component="p"
        color="text.secondary"
        sx={(t) => ({ pt: 3, borderTop: `1px solid ${m3(t).border}` })}
      >
        Analysed under policy v{analysis.policyVersion}, analysis v{analysis.seq} of {detail.versions.length}
      </Typography>
    </Card>
  );
}

export function DecisionSummaryCard({ decision }: { decision: DecisionSummary }) {
  const headingId = useId();
  const changed = decision.recommendedAction !== decision.finalAction;
  return (
    <Card component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionTitle id={headingId}>Human decision</SectionTitle>
      <Typography variant="body2">
        {decision.decider.name} chose to {decision.kind} the recommendation{' '}
        <time dateTime={decision.createdAt}>{relativeTime(decision.createdAt)}</time>.
      </Typography>
      <TagRow>
        <Typography variant="body2">AI suggestion:</Typography>
        <ActionTag action={decision.recommendedAction} />
        <Typography variant="body2">Final:</Typography>
        <ActionTag action={decision.finalAction} />
      </TagRow>
      <Typography variant="caption" color="text.secondary" component="p">
        {changed ? 'The moderator changed the suggested action. ' : ''}Policy v{decision.policyVersion}, analysis v
        {decision.analysisSeq}
        {decision.clauseCodes.length > 0 ? `, ${decision.clauseCodes.join(', ')}` : ''}
        {decision.reasonCategory ? `, reason: ${REASON_LABEL[decision.reasonCategory] ?? decision.reasonCategory}` : ''}
      </Typography>
      {decision.rationale ? (
        <Nested>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {decision.rationale}
          </Typography>
        </Nested>
      ) : null}
      {decision.policyChange ? (
        <Banner tone="warning" icon={<PolicyRounded />}>
          {decision.policyChange.message}. The decision stays under v{decision.policyChange.fromVersion}.
        </Banner>
      ) : null}
    </Card>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card
      component="section"
      aria-label={title}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: { xs: 2, md: 2 } }}
    >
      <Box>
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none' }} />}
          sx={{ ml: -3 }}
        >
          {title}
        </Button>
      </Box>
      <Collapse in={open} id={id} unmountOnExit>
        {children}
      </Collapse>
    </Card>
  );
}

export function AnalysisVersions({ detail }: { detail: CaseDetail }) {
  if (detail.versions.length === 0) return null;
  return (
    <Disclosure title={`Analysis versions (${detail.versions.length})`}>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {detail.versions.map((v) => (
          <Box component="li" key={v.id}>
            <Nested>
              <TagRow>
                <Typography variant="h4" component="p">
                  v{v.seq}
                  {v.id === detail.analysis?.id ? ' (current)' : ''}
                </Typography>
                <PolicyVersionTag version={v.policyVersion} />
                <ActionTag action={v.action} />
              </TagRow>
              <Typography variant="caption" color="text.secondary" component="p">
                Reason: {v.reason.replace('_', ' ')} | {AI_STATUS_LABEL[v.aiStatus]} |{' '}
                <time dateTime={v.createdAt}>{relativeTime(v.createdAt)}</time>
              </Typography>
            </Nested>
          </Box>
        ))}
      </Box>
    </Disclosure>
  );
}

function runRows(run: AiRun): Array<[string, string]> {
  return [
    ['Provider', run.provider],
    ['Model', run.model],
    ['Models tried', run.modelsTried.join(', ') || run.model],
    ['Fallback used', run.fallbackUsed ? 'Yes' : 'No'],
    ['Prompt version', run.promptVersion],
    ['Tokens in / out / thinking', `${run.inputTokens} / ${run.outputTokens} / ${run.thinkingTokens}`],
    ['Estimated cost', `$${run.costUsd.toFixed(6)}`],
    ['Latency', `${run.latencyMs} ms`],
    ['Attempts', String(run.attempts)],
    ['Parse strategy', run.parseStrategy ?? '-'],
    ['Repair used', run.repairUsed ? 'Yes' : 'No'],
    ['Status', AI_STATUS_LABEL[run.status]],
    ...(run.errorCode ? ([['Error', run.errorCode]] as Array<[string, string]>) : []),
  ];
}

export function AiRunDetails({ analysis }: { analysis: Analysis | null }) {
  const run = analysis?.aiRun ?? null;
  return (
    <Disclosure title="AI run details">
      {run ? (
        <Box
          component="dl"
          sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: 2 }}
        >
          {runRows(run).map(([term, value]) => (
            <Box key={term} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2" color="text.secondary">
                {term}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {AI_PENDING}. Rule findings are shown
          {analysis ? ` (${ACTION_LABEL[analysis.recommendation.action].toLowerCase()} suggested)` : ''}.
        </Typography>
      )}
    </Disclosure>
  );
}
