'use client';

import GavelRounded from '@mui/icons-material/GavelRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useSectionLabel } from '../../shell/RoleContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ACTION_LABEL, ClauseTag } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { DotLabel, Tag } from '../../components/Tag';
import { layout, m3, pageSx } from '../../theme/theme';
import { shortDate } from '../feed/format';
import { useCompare, usePolicies, usePolicy, type PolicyClause, type PolicySummary } from './api';
import { DiffView } from './DiffView';
import { PublishFlow } from './PublishFlow';
import { ReevaluationProgress } from './ReevaluationProgress';

// The Policy page (03 sec. 6.9, POL-2..5): versions with the active one tagged, the clauses of a chosen version,
// Compare (two selects + DiffView) and, for admins, the 4-step Publish flow and the re-evaluation progress card.
// Everyone may read the policy; only staff see run progress, and only admins publish.

/** "Keywords: worthless, idiot; 1 pattern": the rule signals as one plain line, or null when there are none. */
export function ruleSignalText(clause: PolicyClause): string | null {
  const s = clause.signals;
  const parts: string[] = [];
  if (s.keywords?.length) parts.push(`Keywords: ${s.keywords.join(', ')}`);
  if (s.patterns?.length) parts.push(`${s.patterns.length} ${s.patterns.length === 1 ? 'pattern' : 'patterns'}`);
  if (s.linkThreshold !== undefined) parts.push(`${s.linkThreshold}+ links`);
  if (s.contactDetails) parts.push('contact details');
  if (s.addressPattern) parts.push('street addresses');
  if (parts.length === 0) return null;
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SEVERITY_WORD: Record<PolicyClause['defaultSeverity'], string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** One term of the clause's definition list: a muted label above (phones) or beside (wider) a plain value. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'contents' }}>
      <Typography component="dt" variant="caption" color="text.secondary" sx={{ pt: { sm: 0.5 } }}>
        {label}
      </Typography>
      <Typography
        component="dd"
        variant="body2"
        sx={{ m: 0, mb: { xs: 2, sm: 0 }, minWidth: 0, overflowWrap: 'anywhere' }}
      >
        {children}
      </Typography>
    </Box>
  );
}

// A clause as a spec sheet (03 sec. 6.9): the code as a small monospace badge, the title, and only when it applies
// an amber "Always to a human" marker (icon and text, no fill); the description as body text; then a compact
// definition list (two label-value columns from 840 px, stacked on phones). Facts are plain words: no coloured
// chips, no icon per fact. Severity alone keeps its dot.
function ClauseItem({ clause }: { clause: PolicyClause }) {
  const signals = ruleSignalText(clause);
  return (
    <Box
      component="li"
      sx={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, py: 4 }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
        <ClauseTag code={clause.code} />
        <Typography variant="h4" component="h3" sx={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>
          {clause.title}
        </Typography>
        {clause.alwaysEscalate ? (
          <Typography
            variant="overline"
            component="span"
            sx={(t) => ({ display: 'inline-flex', alignItems: 'center', gap: 1, color: m3(t).warning })}
          >
            <PersonRounded aria-hidden sx={{ fontSize: 16 }} />
            Always to a human
          </Typography>
        ) : null}
      </Box>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {clause.text}
      </Typography>
      <Box
        component="dl"
        aria-label={`${clause.code} rules`}
        sx={{
          m: 0,
          mt: 1,
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'max-content minmax(0, 1fr)',
            md: 'max-content minmax(0, 1fr) max-content minmax(0, 1fr)',
          },
          columnGap: 4,
          rowGap: { xs: 0, sm: 2 },
          alignItems: 'start',
        }}
      >
        <Fact label="Severity">
          <DotLabel tone={clause.defaultSeverity} size="body">
            {SEVERITY_WORD[clause.defaultSeverity]}
          </DotLabel>
        </Fact>
        <Fact label="Default action">{ACTION_LABEL[clause.defaultAction]}</Fact>
        <Fact label="Allowed actions">{clause.allowedActions.map((action) => ACTION_LABEL[action]).join(', ')}</Fact>
        {signals ? <Fact label="Rule signals">{signals}</Fact> : null}
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
          sx={(t) => ({
            m: 0,
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            '& > li:first-of-type': { pt: 0 },
            '& > li:last-of-type': { pb: 0 },
            '& > li + li': { borderTop: `1px solid ${m3(t).border}` },
          })}
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
        borderRadius: `${layout.controlRadius}px`,
        backgroundColor: selected ? m3(t).selected : 'transparent',
      })}
    >
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" component="p">
            v{summary.version}
          </Typography>
          {summary.status === 'active' ? <Tag label="Active" tone="success" /> : <Tag label="Retired" />}
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
      <Button variant={selected ? 'secondary' : 'ghost'} aria-pressed={selected} onClick={onSelect}>
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
  const section = useSectionLabel('policy');
  const [selected, setSelected] = useState<number | null>(null);
  const [publishedRunId, setPublishedRunId] = useState<string | null>(null);

  return (
    <Box data-ui="section" sx={pageSx}>
      <PageHeader
        section={section}
        title="Policy"
        description="Policies are versioned data. Every analysis and decision records the version it used."
        maxWidth={layout.formWidth}
      />
      <Box sx={{ maxWidth: layout.formWidth, display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
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
