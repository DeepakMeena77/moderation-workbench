'use client';

import BlockRounded from '@mui/icons-material/BlockRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import PolicyRounded from '@mui/icons-material/PolicyRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import {
  useAppeal,
  useResolveAppeal,
  type AppealDetail,
  type AppealOutcome,
  type Clause,
  type Finding,
  type ModAction,
} from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChoiceChips, type ChoiceChipsHandle } from '../../components/ChoiceChips';
import { HighlightedText, type Highlight } from '../../components/HighlightedText';
import { ACTION_LABEL, ActionTag, ClauseTag, PolicyVersionTag, StatusTag } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { useSnackbar } from '../../components/SnackbarProvider';
import { Tag } from '../../components/Tag';
import { layout, m3 } from '../../theme/theme';
import { REASON_LABEL } from '../case/decisionForm';
import { relativeTime } from '../feed/format';
import {
  EMPTY_RESOLVE,
  MAX_RATIONALE_CHARS,
  MODIFY_ACTIONS,
  modifyActionReason,
  OUTCOMES,
  RESOLVE_FIELDS,
  resolveSuccessMessage,
  toResolveRequest,
  validateResolve,
  type ResolveDraft,
  type ResolveErrors,
  type ResolveField,
} from './resolveForm';

// The appeal review page (03 sec. 6.8, APP-3..5, AI-12): three panels - Original decision, Appeal evidence (with
// the AI summary, which never recommends an outcome) and Outcome (pending or the result, plus the resolve form).
// The panels stack in a narrow pane, sit in two columns (Original, Appeal) with the outcome below once the pane is
// wide, and in three columns when it is wider still (03 sec. 5.1). The original decider sees why they cannot
// resolve, with every control disabled. All user and AI text is plain text (SEC-3).

export const BLOCKED_MESSAGE = 'You made the original decision - another senior moderator must review this.';
const TWO_COLUMNS_MIN = 760;
const THREE_COLUMNS_MIN = 1100;
const CONFLICT_CODES = new Set(['ALREADY_DECIDED', 'INVALID_TRANSITION']);

const OUTCOME_WORD: Record<AppealOutcome, string> = { uphold: 'Upheld', overturn: 'Overturned', modify: 'Modified' };

function Panel({ title, children, area }: { title: string; children: ReactNode; area: string }) {
  const headingId = useId();
  return (
    <Card
      component="section"
      aria-labelledby={headingId}
      sx={{ gridArea: area, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
    >
      <Typography id={headingId} variant="h3" component="h2">
        {title}
      </Typography>
      {children}
    </Card>
  );
}

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
        backgroundColor: m3(t).cardNested,
        minWidth: 0,
      })}
    >
      {children}
    </Box>
  );
}

function TagRow({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>{children}</Box>;
}

/** Highlights for the confirmed evidence the decision was based on; interpretations are not highlighted. */
export function findingHighlights(findings: readonly Finding[], clauses: readonly Clause[]): Highlight[] {
  const titles = new Map(clauses.map((c) => [c.code, `${c.code} - ${c.title}`]));
  return findings
    .filter((f) => f.source === 'rule' || f.evidenceType === 'confirmed')
    .flatMap((f) =>
      f.quotes.flatMap((q) =>
        q.start !== null && q.end !== null
          ? [{ start: q.start, end: q.end, code: f.clauseCode, title: titles.get(f.clauseCode) ?? f.clauseCode }]
          : [],
      ),
    );
}

function OriginalPanel({ detail }: { detail: AppealDetail }) {
  const { original } = detail;
  const titles = new Map(detail.clauses.map((c) => [c.code, c.title]));
  return (
    <Panel title="Original decision" area="original">
      <TagRow>
        <ActionTag action={original.finalAction} />
        {original.clauseCodes.map((code) => (
          <ClauseTag key={code} code={code} title={titles.get(code)} />
        ))}
        <PolicyVersionTag version={original.policyVersion} />
      </TagRow>
      <Typography variant="body2">
        {original.decider.name} chose to {original.kind} the recommendation (AI suggested{' '}
        {ACTION_LABEL[original.recommendedAction].toLowerCase()}) on analysis v{original.analysisSeq},{' '}
        <time dateTime={original.createdAt}>{relativeTime(original.createdAt)}</time>.
        {original.reasonCategory ? ` Reason: ${REASON_LABEL[original.reasonCategory] ?? original.reasonCategory}.` : ''}
      </Typography>
      {original.rationale ? (
        <Nested label="Moderator rationale">
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {original.rationale}
          </Typography>
        </Nested>
      ) : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h4" component="h3">
          {detail.content.type === 'post' ? 'Post' : 'Comment'} by {detail.content.author.name}
        </Typography>
        <HighlightedText text={detail.content.body} highlights={findingHighlights(original.findings, detail.clauses)} />
        <Typography variant="caption" color="text.secondary">
          Visible to others as: {detail.content.visibility}
        </Typography>
      </Box>
    </Panel>
  );
}

function BriefCard({ detail }: { detail: AppealDetail }) {
  const { brief } = detail;
  const titles = new Map(detail.clauses.map((c) => [c.code, c.title]));
  return (
    <Nested label="AI summary">
      <TagRow>
        <Tag label="AI summary" tone="neutral" />
        <Typography variant="caption" color="text.secondary">
          Does not recommend an outcome. A senior moderator decides.
        </Typography>
      </TagRow>
      {brief.state === 'ready' && brief.outcomeLanguage ? (
        // AI-12: the server's verify step found recommending language in the summary or a new point.
        <Banner tone="warning" role="note">
          This summary may contain a recommendation. Decide from the evidence.
        </Banner>
      ) : null}
      {brief.state === 'pending' ? (
        <Typography variant="body2" role="status">
          Writing the summary... This updates by itself.
        </Typography>
      ) : brief.state === 'unavailable' ? (
        <Typography variant="body2">{brief.reason}. Review the appeal from the evidence above.</Typography>
      ) : (
        <>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {brief.summary}
          </Typography>
          <Typography variant="h4" component="h3">
            New points raised
          </Typography>
          {brief.newPoints.length > 0 ? (
            <Box component="ul" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {brief.newPoints.map((point, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {point}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No new points.
            </Typography>
          )}
          <Typography variant="h4" component="h3">
            Disputed findings
          </Typography>
          {brief.disputedFindings.length > 0 ? (
            <Box
              component="ul"
              sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {brief.disputedFindings.map((d, i) => (
                <Box component="li" key={`${d.clauseCode}-${i}`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <ClauseTag code={d.clauseCode} title={titles.get(d.clauseCode)} />
                  <Typography variant="body2" sx={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {d.authorClaim}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              The author does not dispute a specific finding.
            </Typography>
          )}
          {brief.model ? (
            <Typography variant="caption" color="text.secondary">
              {brief.model}
              {brief.costUsd !== null ? `, $${brief.costUsd.toFixed(6)}` : ''}
            </Typography>
          ) : null}
        </>
      )}
    </Nested>
  );
}

function EvidencePanel({ detail }: { detail: AppealDetail }) {
  const { evidence } = detail;
  return (
    <Panel title="Appeal evidence" area="evidence">
      <Typography variant="caption" color="text.secondary">
        From {detail.content.author.name}, <time dateTime={detail.createdAt}>{relativeTime(detail.createdAt)}</time>
      </Typography>
      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {evidence.statement}
      </Typography>
      {evidence.links.length > 0 ? (
        <Box>
          <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
            Links
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {evidence.links.map((link) => (
              <Typography key={link} component="li" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                <Link href={link} target="_blank" rel="noopener noreferrer nofollow">
                  {link}
                </Link>
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}
      {evidence.note ? (
        <Nested label="Author note">
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {evidence.note}
          </Typography>
        </Nested>
      ) : null}
      <BriefCard detail={detail} />
    </Panel>
  );
}

function ResolveForm({ detail, onReload }: { detail: AppealDetail; onReload: () => void }) {
  const resolve = useResolveAppeal(detail.id);
  const notify = useSnackbar();
  const [draft, setDraft] = useState<ResolveDraft>(EMPTY_RESOLVE);
  const [errors, setErrors] = useState<ResolveErrors>({});
  const [failure, setFailure] = useState<{ conflict: boolean; message: string } | null>(null);
  const outcomeRef = useRef<ChoiceChipsHandle>(null);
  const actionRef = useRef<ChoiceChipsHandle>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const blocked = detail.permissions.isOriginalDecider;
  const locked = blocked || !detail.permissions.canResolve;
  const lockReason = blocked ? 'You made the original decision.' : 'Only a senior moderator can resolve appeals.';

  const focus = (field: ResolveField) => {
    if (field === 'outcome') outcomeRef.current?.focus();
    else if (field === 'finalAction') actionRef.current?.focus();
    else rationaleRef.current?.focus();
  };

  const update = (patch: Partial<ResolveDraft>, field: ResolveField) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || resolve.isPending) return;
    setFailure(null);
    const found = validateResolve(draft, detail.original, detail.clauses);
    setErrors(found);
    const first = RESOLVE_FIELDS.find((f) => found[f]);
    if (first) {
      focus(first);
      return;
    }
    resolve.mutate(toResolveRequest(draft), {
      onSuccess: (result) => notify(resolveSuccessMessage(result)),
      onError: (error) => {
        if (error instanceof ApiError && CONFLICT_CODES.has(error.code)) {
          setFailure({ conflict: true, message: error.message });
          return;
        }
        if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
          const fromServer: ResolveErrors = {};
          for (const d of error.details as Array<{ path?: unknown; message?: unknown }>) {
            const path = typeof d.path === 'string' ? (d.path.split('.')[0] as ResolveField) : null;
            if (path && RESOLVE_FIELDS.includes(path) && typeof d.message === 'string') fromServer[path] = d.message;
          }
          setErrors(fromServer);
        }
        setFailure({
          conflict: false,
          message:
            error instanceof ApiError && error.status !== 0 && error.status < 500
              ? error.message
              : "Couldn't save the outcome. Your choices are kept - try again.",
        });
      },
    });
  };

  return (
    <Box
      component="form"
      noValidate
      aria-label="Resolve the appeal"
      onSubmit={submit}
      data-ui="section"
      sx={(t) => ({
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        p: 3,
        borderRadius: `${layout.controlRadius}px`,
        border: `1px solid ${m3(t).border}`,
        backgroundColor: m3(t).cardNested,
      })}
    >
      {failure ? (
        <Banner
          tone={failure.conflict ? 'warning' : 'error'}
          role="alert"
          action={
            failure.conflict ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setFailure(null);
                  onReload();
                }}
              >
                Reload
              </Button>
            ) : null
          }
        >
          {failure.message}
        </Banner>
      ) : null}
      <ChoiceChips<AppealOutcome>
        ref={outcomeRef}
        label="Outcome"
        options={OUTCOMES.map((o) => ({ ...o, disabledReason: locked ? lockReason : undefined }))}
        value={draft.outcome ? [draft.outcome] : []}
        error={errors.outcome}
        onChange={([outcome]) => update({ outcome: outcome ?? null, finalAction: null }, 'outcome')}
      />
      {draft.outcome === 'modify' ? (
        <ChoiceChips<ModAction>
          ref={actionRef}
          label="New action"
          options={MODIFY_ACTIONS.map((action) => ({
            value: action,
            label: ACTION_LABEL[action],
            disabledReason: modifyActionReason(action, detail.original, detail.clauses) ?? undefined,
          }))}
          value={draft.finalAction ? [draft.finalAction] : []}
          error={errors.finalAction}
          onChange={([action]) => update({ finalAction: action ?? null }, 'finalAction')}
        />
      ) : null}
      <TextField
        inputRef={rationaleRef}
        label="Rationale"
        value={draft.rationale}
        onChange={(event) => update({ rationale: event.target.value }, 'rationale')}
        multiline
        minRows={3}
        fullWidth
        required
        disabled={locked}
        error={Boolean(errors.rationale)}
        helperText={
          <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <span>
              {errors.rationale ?? 'At least 10 characters. The author sees the outcome, staff see this text.'}
            </span>
            <span aria-label={`${draft.rationale.length} of ${MAX_RATIONALE_CHARS} characters`}>
              {draft.rationale.length}/{MAX_RATIONALE_CHARS}
            </span>
          </Box>
        }
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" loading={resolve.isPending} disabled={locked}>
          Resolve appeal
        </Button>
      </Box>
    </Box>
  );
}

function OutcomePanel({ detail, onReload }: { detail: AppealDetail; onReload: () => void }) {
  const { outcome, permissions } = detail;
  return (
    <Panel title="Outcome" area="outcome">
      {outcome ? (
        <>
          <TagRow>
            <Tag label={OUTCOME_WORD[outcome.outcome]} tone="neutral" />
            <Typography variant="body2">Final:</Typography>
            <ActionTag action={outcome.finalAction} />
          </TagRow>
          <Typography variant="body2">
            {outcome.resolver.name} resolved this appeal{' '}
            <time dateTime={outcome.resolvedAt}>{relativeTime(outcome.resolvedAt)}</time>.
          </Typography>
          <Nested label="Resolution rationale">
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {outcome.rationale}
            </Typography>
          </Nested>
        </>
      ) : (
        <>
          <TagRow>
            <Tag label="Pending" tone="neutral" />
            <Typography variant="body2">
              {detail.assignedReviewer
                ? `Assigned to ${detail.assignedReviewer.name}. Any other senior moderator may also resolve it.`
                : 'No reviewer assigned: no eligible senior moderator was available.'}
            </Typography>
          </TagRow>
          {permissions.isOriginalDecider ? (
            <Banner tone="warning" icon={<BlockRounded />} role="note">
              {BLOCKED_MESSAGE}
            </Banner>
          ) : permissions.readOnly ? (
            <Banner icon={<VisibilityRounded />}>
              Read-only: only a senior moderator who did not make the decision can resolve appeals.
            </Banner>
          ) : null}
          <ResolveForm detail={detail} onReload={onReload} />
        </>
      )}
    </Panel>
  );
}

export function AppealBody({ detail, onReload }: { detail: AppealDetail; onReload: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap, containerType: 'inline-size' }}>
      <TagRow>
        <StatusTag status={detail.caseStatus} />
        <Button
          variant="ghost"
          href={`/content/${encodeURIComponent(detail.content.id)}/history`}
          LinkComponent={NextLink}
          startIcon={<HistoryRounded />}
        >
          Open history
        </Button>
      </TagRow>
      {detail.policyChangedSinceDecision ? (
        <Banner tone="warning" icon={<PolicyRounded />} title="Policy changed since decision">
          The decision used policy v{detail.original.policyVersion}; the active policy is now v
          {detail.activePolicyVersion}.
        </Banner>
      ) : null}
      {detail.newerAnalysis ? (
        <Banner>
          Re-analysed while appealed: analysis v{detail.newerAnalysis.seq} under policy v
          {detail.newerAnalysis.policyVersion} suggests {ACTION_LABEL[detail.newerAnalysis.action].toLowerCase()}
          {detail.newerAnalysis.clauseCodes.length > 0 ? ` (${detail.newerAnalysis.clauseCodes.join(', ')})` : ''}.
        </Banner>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gap: layout.stackGap,
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateAreas: '"original" "evidence" "outcome"',
          alignItems: 'start',
          [`@container (min-width: ${TWO_COLUMNS_MIN}px)`]: {
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gridTemplateAreas: '"original evidence" "outcome outcome"',
          },
          [`@container (min-width: ${THREE_COLUMNS_MIN}px)`]: {
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateAreas: '"original evidence outcome"',
          },
        }}
      >
        <OriginalPanel detail={detail} />
        <EvidencePanel detail={detail} />
        <OutcomePanel detail={detail} onReload={onReload} />
      </Box>
    </Box>
  );
}

export function AppealReview({ appealId }: { appealId: string }) {
  const query = useAppeal(appealId);
  return (
    <QueryState
      query={query}
      loadingLabel="Loading the appeal"
      skeleton={
        <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
          <CardSkeleton height={220} />
          <CardSkeleton height={220} />
        </Box>
      }
    >
      {(detail) => <AppealBody detail={detail} onReload={() => void query.refetch()} />}
    </QueryState>
  );
}
