'use client';

import RefreshRounded from '@mui/icons-material/RefreshRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { PageHeader } from '../../components/PageHeader';
import { useSectionLabel } from '../../shell/RoleContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { StatCard } from '../../components/StatCard';
import { layout, m3, pageSx } from '../../theme/theme';
import { shortDateTime } from '../feed/format';
import { useMetrics, type Metrics } from './api';

// The Metrics page (03 sec. 6.11, OPS-6): stat cards, then simple CSS bar lists (no chart library). Every bar
// repeats its value as text, so the bars themselves are decorative.

const REASON_LABEL: Record<string, string> = {
  false_positive: 'False positive',
  missing_context: 'Missing context',
  wrong_clause: 'Wrong clause',
  severity_too_high: 'Severity too high',
  severity_too_low: 'Severity too low',
  policy_gap: 'Policy gap',
  other: 'Other',
};

const STATUS_LABEL: Record<string, string> = {
  timeout: 'Timeout',
  rate_limited: 'Rate limited',
  invalid_output: 'Invalid output',
  invalid_input: 'Invalid input',
  provider_error: 'Provider error',
  budget_exhausted: 'Daily budget reached',
  unavailable: 'Unavailable',
};

const percent = (rate: number | null) => (rate === null ? '-' : `${Math.round(rate * 100)}%`);
const count = (n: number) => n.toLocaleString('en-US');
const usd = (n: number) => `$${n.toFixed(4)}`;
const plural = (n: number, word: string) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

interface Bar {
  key: string;
  label: string;
  value: number;
  text: string;
}

function BarList({ title, bars, empty }: { title: string; bars: Bar[]; empty: string }) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  return (
    <Card component="section" aria-label={title} sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      {bars.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {bars.map((bar) => (
            <Box
              component="li"
              key={bar.key}
              sx={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {bar.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {bar.text}
                </Typography>
              </Box>
              <Box
                aria-hidden
                sx={(t) => ({
                  height: 4,
                  borderRadius: '2px',
                  backgroundColor: m3(t).surfaceContainerHigh,
                  overflow: 'hidden',
                })}
              >
                <Box
                  sx={(t) => ({
                    height: '100%',
                    width: `${max === 0 ? 0 : (bar.value / max) * 100}%`,
                    borderRadius: '2px',
                    backgroundColor: m3(t).primary,
                  })}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Card>
  );
}

const GRID = {
  display: 'grid',
  gap: layout.stackGap,
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    sm: 'repeat(2, minmax(0, 1fr))',
    md: 'repeat(3, minmax(0, 1fr))',
    lg: 'repeat(4, minmax(0, 1fr))',
  },
} as const;

function Report({ metrics }: { metrics: Metrics }) {
  const { agreement, overrides, aiFailures, latency, usage, autoClear } = metrics;
  const days = `${metrics.windowDays} d`;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
      <Box sx={GRID}>
        <StatCard
          title="AI and human agreement"
          value={percent(agreement.rate)}
          detail={
            agreement.decisions === 0
              ? `No decisions on AI analyses in ${days}`
              : `${count(agreement.agreed)} of ${plural(agreement.decisions, 'decision')} kept the AI action (${days})`
          }
        />
        <StatCard title="Overrides" value={count(overrides.total)} detail={`Rejected or modified (${days})`} />
        <StatCard
          title="AI failure rate"
          value={percent(aiFailures.rate)}
          detail={`${count(aiFailures.failed)} of ${plural(aiFailures.runs, 'run')} (${days})`}
        />
        <StatCard
          title="Auto-cleared, then revisited"
          value={percent(autoClear.rate)}
          detail={
            autoClear.cleared === 0
              ? `No auto-cleared cases in ${days}. Auto-clear skips the human queue.`
              : `${count(autoClear.revisited)} of ${plural(autoClear.cleared, 'auto-cleared case')} later reported or ` +
                `reopened (${days}). Auto-clear skips the human queue; these came back to it.`
          }
        />
        <StatCard
          title="Median latency (p50)"
          value={latency.p50Ms === null ? '-' : `${count(latency.p50Ms)} ms`}
          detail={
            latency.p90Ms === null
              ? 'No AI calls yet'
              : `p90 ${count(latency.p90Ms)} ms, ${plural(latency.runs, 'call')}`
          }
        />
        <StatCard
          title="Tokens (24 h)"
          value={count(usage.last24h.tokens)}
          detail={`${count(usage.last7d.tokens)} in ${days}`}
        />
        <StatCard
          title="Cost (24 h)"
          value={usd(usage.last24h.costUsd)}
          detail={`${usd(usage.last7d.costUsd)} in ${days}`}
        />
      </Box>
      <Box sx={{ ...GRID, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' } }}>
        <BarList
          title="Override reasons"
          empty="No overrides in this period."
          bars={overrides.byReason.map((r) => ({
            key: r.reason,
            label: REASON_LABEL[r.reason] ?? r.reason,
            value: r.count,
            text: count(r.count),
          }))}
        />
        <BarList
          title="AI failures by reason"
          empty="No failed AI runs in this period."
          bars={aiFailures.byStatus.map((s) => ({
            key: s.status,
            label: STATUS_LABEL[s.status] ?? s.status,
            value: s.count,
            text: count(s.count),
          }))}
        />
        <BarList
          title="Cost by day (UTC)"
          empty="No AI runs in this period."
          bars={usage.byDay.map((d) => ({
            key: d.day,
            label: dayLabel(d.day),
            value: d.costUsd,
            text: `${usd(d.costUsd)}, ${count(d.tokens)} tokens`,
          }))}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" component="p">
        Updated{' '}
        <time dateTime={metrics.generatedAt} title={metrics.generatedAt}>
          {shortDateTime(metrics.generatedAt)}
        </time>
        . Refreshes every minute.
      </Typography>
    </Box>
  );
}

export function MetricsView() {
  const query = useMetrics();
  const section = useSectionLabel('metrics');
  return (
    <Box sx={{ ...pageSx, minWidth: 0 }}>
      <PageHeader
        section={section}
        title="Metrics"
        description="How often people agree with the AI, how often it fails, and what it costs."
        action={
          <Button
            variant="secondary"
            startIcon={<RefreshRounded />}
            onClick={() => void query.refetch()}
            loading={query.isFetching}
          >
            Refresh
          </Button>
        }
      />
      <QueryState
        query={query}
        loadingLabel="Loading metrics"
        skeleton={
          <Box sx={GRID}>
            {Array.from({ length: 4 }, (_, i) => (
              <CardSkeleton key={i} height={120} />
            ))}
          </Box>
        }
      >
        {(metrics) => <Report metrics={metrics} />}
      </QueryState>
    </Box>
  );
}
