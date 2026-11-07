'use client';

import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import PriorityHighRounded from '@mui/icons-material/PriorityHighRounded';
import RuleRounded from '@mui/icons-material/RuleRounded';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ActionTag, SeverityTag } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { Tag } from '../../components/Tag';
import { layout, m3, pageSx } from '../../theme/theme';
import { shortDate } from '../feed/format';
import { useCompare, usePolicies, usePolicy, type PolicyClause, type PolicySummary } from './api';
import { DiffView } from './DiffView';
import { PublishFlow } from './PublishFlow';
import { ReevaluationProgress } from './ReevaluationProgress';

// The Policy page (03 sec. 6.9, POL-2..5): versions with the active one tagged, the clauses of a chosen version,
// Compare (two selects + DiffView) and, for admins, the 4-step Publish flow and the re-evaluation progress card.
// Everyone may read the policy; only staff see run progress, and only admins publish.

/** Short rule signals, shown as tags. Keywords can be long, so they are listed as text instead. */
function signalTags(clause: PolicyClause): string[] {
  const s = clause.signals;
  const parts: string[] = [];
  if (s.patterns?.length) parts.push(`${s.patterns.length} ${s.patterns.length === 1 ? 'pattern' : 'patterns'}`);
  if (s.linkThreshold !== undefined) parts.push(`${s.linkThreshold}+ links`);
  if (s.contactDetails) parts.push('Contact details');
  if (s.addressPattern) parts.push('Street addresses');
  return parts;
}

/** One labelled row of the clause facts: the label on the left (stacked above on compact), the value on the right. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'contents' }}>
      <Typography component="dt" variant="caption" color="text.secondary" sx={{ pt: { sm: 1 } }}>
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, mb: { xs: 2, sm: 0 }, display: 'flex', flexWrap: 'wrap', gap: 2, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

// A clause as a card of facts (03 sec. 4): each fact has its own labelled row and its semantic tag (icon + tonal
// colour), so severity, the default action and the allowed actions read as different things at a glance.
function ClauseItem({ clause }: { clause: PolicyClause }) {
  const tags = signalTags(clause);
  const keywords = clause.signals.keywords ?? [];
  return (
    <Box
      component="li"
      data-ui="section"
      sx={(t) => ({
        listStyle: 'none',
        borderRadius: `${layout.nestedRadius}px`,
        p: 3,
        backgroundColor: m3(t).cardNested,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
      })}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Tag label={clause.code} tone="secondary" />
        <Typography variant="h4" component="h3" sx={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>
          {clause.title}
        </Typography>
        {clause.alwaysEscalate ? <Tag label="Always to a human" tone="warning" icon={<PriorityHighRounded />} /> : null}
      </Box>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {clause.text}
      </Typography>
      <Box
        component="dl"
        aria-label={`${clause.code} rules`}
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, max-content) minmax(0, 1fr)' },
          columnGap: 6,
          rowGap: { xs: 1, sm: 2 },
          alignItems: 'start',
        }}
      >
        <Fact label="Severity">
          <SeverityTag severity={clause.defaultSeverity} />
        </Fact>
        <Fact label="Default action">
          <ActionTag action={clause.defaultAction} />
        </Fact>
        <Fact label="Allowed actions">
          {clause.allowedActions.map((action) => (
            <ActionTag key={action} action={action} />
          ))}
        </Fact>
        {tags.length > 0 || keywords.length > 0 ? (
          <Fact label="Rule signals">
            {tags.map((tag) => (
              <Tag key={tag} label={tag} icon={<RuleRounded />} />
            ))}
            {keywords.length > 0 ? (
              <Typography variant="body2" sx={{ flexBasis: '100%', overflowWrap: 'anywhere' }}>
                Keywords: {keywords.join(', ')}
              </Typography>
            ) : null}
          </Fact>
        ) : null}
      </Box>
    </Box>
  );
}

function VersionClauses({ version }: { version: number }) {
  const policy = usePolicy(version);
  return (
    <QueryState query={policy} loadingLabel={`Loading policy v${version}`} skeleton={<CardSkeleton height={240} />}>
      {(data) => (
        <Box
          component="ul"
          aria-label={`Clauses of v${version}`}
          sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {data.clauses.map((clause) => (
            <ClauseItem key={clause.code} clause={clause} />
          ))}
        </Box>
      )}
    </QueryState>
  );
}

function VersionRow({
  summary,
  selected,
  onSelect,
}: {
  summary: PolicySummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Box
      component="li"
      sx={(t) => ({
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 3,
        px: 3,
        py: 2,
        borderRadius: `${layout.nestedRadius}px`,
        backgroundColor: selected ? m3(t).selected : 'transparent',
      })}
    >
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          <Typography variant="h3" component="p">
            v{summary.version}
          </Typography>
          {summary.status === 'active' ? (
            <Tag label="Active" tone="success" icon={<CheckCircleRounded />} />
          ) : (
            <Tag label="Retired" />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {shortDate(summary.publishedAt)} - {summary.clauseCount} clauses
          {summary.publishedBy ? ` - published by ${summary.publishedBy}` : ''}
        </Typography>
        {summary.notes ? (
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {summary.notes}
          </Typography>
        ) : null}
      </Box>
      <Button variant={selected ? 'tonal' : 'text'} aria-pressed={selected} onClick={onSelect}>
        Show v{summary.version} clauses
      </Button>
    </Box>
  );
}

function CompareCard({ versions }: { versions: PolicySummary[] }) {
  const newest = versions[0]?.version ?? null;
  const previous = versions[1]?.version ?? null;
  const [from, setFrom] = useState<number | null>(previous);
  const [to, setTo] = useState<number | null>(newest);
  const compare = useCompare(from, to);

  if (versions.length < 2) {
    return (
      <Typography variant="body2" color="text.secondary">
        There is only one version so far. Compare becomes available after the next publish.
      </Typography>
    );
  }

  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(
          [
            ['From', from, setFrom],
            ['To', to, setTo],
          ] as const
        ).map(([label, value, set]) => (
          <TextField
            key={label}
            select
            label={label}
            value={value ?? ''}
            onChange={(event) => set(Number(event.target.value))}
            sx={{ flex: '1 1 140px', maxWidth: 240 }}
          >
            {versions.map((v) => (
              <MenuItem key={v.version} value={v.version}>
                v{v.version}
                {v.status === 'active' ? ' (active)' : ''}
              </MenuItem>
            ))}
          </TextField>
        ))}
      </Box>
      {from === to ? (
        <Typography variant="body2" color="text.secondary">
          Choose two different versions.
        </Typography>
      ) : (
        <QueryState query={compare} loadingLabel="Comparing versions" skeleton={<CardSkeleton height={160} />}>
          {(data) => <DiffView diff={data.diff} fromLabel={`v${data.from}`} toLabel={`v${data.to}`} />}
        </QueryState>
      )}
    </Box>
  );
}

export function PolicyView({ canPublish, canSeeRuns }: { canPublish: boolean; canSeeRuns: boolean }) {
  const policies = usePolicies();
  const [selected, setSelected] = useState<number | null>(null);
  const [publishedRunId, setPublishedRunId] = useState<string | null>(null);

  return (
    <Box data-ui="section" sx={pageSx}>
      <Box sx={{ maxWidth: layout.formWidth, display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
        <Typography variant="h1" sx={{ mb: { xs: 0, sm: 1 } }}>
          Policy
        </Typography>
        <QueryState
          query={policies}
          loadingLabel="Loading policy versions"
          skeleton={<CardSkeleton height={200} />}
          isEmpty={(data) => data.versions.length === 0}
          empty={
            <Card>
              <EmptyState
                icon={<GavelRounded />}
                title="No policy is installed yet."
                description="Run the seed to install policy v1."
              />
            </Card>
          }
        >
          {(data) => {
            const active = data.versions.find((v) => v.status === 'active') ?? data.versions[0];
            const shown = selected ?? active?.version ?? null;
            // The run just started here, or the latest run while it is still going or has failures to retry.
            const latest = data.latestRun;
            const runId = publishedRunId ?? (latest && latest.state !== 'finished' ? latest.id : null);
            return (
              <>
                {canSeeRuns && runId ? <ReevaluationProgress runId={runId} canRetry={canSeeRuns} /> : null}

                <Card component="section" aria-labelledby="policy-versions">
                  <Typography id="policy-versions" variant="h2" component="h2" sx={{ mb: 2 }}>
                    Versions
                  </Typography>
                  <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {data.versions.map((summary) => (
                      <VersionRow
                        key={summary.version}
                        summary={summary}
                        selected={summary.version === shown}
                        onSelect={() => setSelected(summary.version)}
                      />
                    ))}
                  </Box>
                </Card>

                {shown !== null ? (
                  <Card component="section" aria-labelledby="policy-clauses">
                    <Typography id="policy-clauses" variant="h2" component="h2" sx={{ mb: 2 }}>
                      Clauses in v{shown}
                    </Typography>
                    <VersionClauses version={shown} />
                  </Card>
                ) : null}

                <Card component="section" aria-labelledby="policy-compare">
                  <Typography id="policy-compare" variant="h2" component="h2" sx={{ mb: 2 }}>
                    Compare versions
                  </Typography>
                  <CompareCard key={data.versions.length} versions={data.versions} />
                </Card>

                {canPublish ? (
                  <Card component="section" aria-labelledby="policy-publish">
                    <Typography id="policy-publish" variant="h2" component="h2" sx={{ mb: 1 }}>
                      Publish a new version
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Publishing retires the active version and re-analyses every unresolved case.
                    </Typography>
                    <PublishFlow onPublished={setPublishedRunId} />
                  </Card>
                ) : null}
              </>
            );
          }}
        </QueryState>
      </Box>
    </Box>
  );
}
