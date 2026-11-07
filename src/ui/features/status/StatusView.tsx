'use client';

import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import type { ReactElement, ReactNode } from 'react';
import { useStatus, type CheckState, type StatusCheck, type StatusReport } from '../../api/hooks';
import { Banner, type BannerTone } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { DotLabel, type DotTone } from '../../components/Tag';
import { layout, m3, pageSx, titleGap } from '../../theme/theme';
import { shortDateTime } from '../feed/format';
import { JobsAdminPanel } from './JobsAdminPanel';

// Public status page (docs/03-ui-ux.md sec. 6.12): the overall state and one card per check. Timestamps show as
// readable local times, with the ISO value in the tooltip.

const STATE_TAG: Record<CheckState, { label: string; dot: DotTone; icon: ReactElement<SvgIconProps> }> = {
  ok: { label: 'Operational', dot: 'ok', icon: <CheckCircleRounded /> },
  warn: { label: 'Degraded', dot: 'warn', icon: <WarningRounded /> },
  fail: { label: 'Down', dot: 'fail', icon: <ErrorRounded /> },
};

const OVERALL_TEXT: Record<CheckState, string> = {
  ok: 'All systems operational',
  warn: 'Degraded: some checks need attention',
  fail: 'Outage: at least one check is failing',
};

const CHECK_TITLE: Record<string, string> = {
  app: 'App',
  database: 'Database',
  llm: 'AI model',
  jobs: 'Background jobs',
  policy: 'Policy',
  aiUsage: 'AI usage (24 h)',
};

const DETAIL_LABEL: Record<string, string> = {
  release: 'Release',
  buildTime: 'Built',
  uptimeS: 'Uptime (s)',
  latencyMs: 'Latency (ms)',
  reason: 'Reason',
  provider: 'Provider',
  model: 'Model',
  fallbackModel: 'Fallback model',
  lastSuccess: 'Last success',
  lastError: 'Last error',
  lastErrorAt: 'Last error at',
  callsToday: 'Calls today',
  queued: 'Queued',
  running: 'Running',
  failed24h: 'Failed (24 h)',
  stuck: 'Stuck',
  oldestQueuedS: 'Oldest queued (s)',
  activeVersion: 'Active version',
  publishedAt: 'Published',
  runs24h: 'Runs',
  inputTokens: 'Input tokens',
  outputTokens: 'Output tokens',
  costUsd: 'Cost (USD)',
  avgLatencyMs: 'Avg latency (ms)',
};

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** An ISO timestamp as a readable local time ("7 Nov, 19:13"); the exact ISO value stays in the tooltip. */
function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso}>
      {shortDateTime(iso)}
    </time>
  );
}

function formatDetail(key: string, value: string | number | null): ReactNode {
  if (value === null) return '-';
  if (key === 'release' && typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)) return value.slice(0, 7);
  if (typeof value === 'string' && ISO_TIME.test(value) && !Number.isNaN(Date.parse(value))) {
    return <LocalTime iso={value} />;
  }
  return String(value);
}

function CheckCard({ check }: { check: StatusCheck }) {
  const tag = STATE_TAG[check.state];
  const title = CHECK_TITLE[check.check] ?? check.check;
  return (
    <Card component="section" aria-label={`${title} check`}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        <DotLabel tone={tag.dot}>{tag.label}</DotLabel>
      </Box>
      <Box
        component="dl"
        sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 4, rowGap: 1 }}
      >
        {Object.entries(check.detail).map(([key, value]) => (
          <Box key={key} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {DETAIL_LABEL[key] ?? key}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {formatDetail(key, value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

const OVERALL_TONE: Record<CheckState, BannerTone> = { ok: 'success', warn: 'warning', fail: 'error' };

function Report({ report }: { report: StatusReport }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
      <Banner tone={OVERALL_TONE[report.overall]} icon={STATE_TAG[report.overall].icon} role="status">
        <Box component="span" sx={{ fontWeight: 500 }}>
          {OVERALL_TEXT[report.overall]}.
        </Box>{' '}
        Checked <LocalTime iso={report.checkedAt} />. Refreshes every 30 seconds.
      </Banner>
      <Box
        sx={{
          display: 'grid',
          gap: layout.stackGap,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
        }}
      >
        {report.checks.map((check) => (
          <CheckCard key={check.check} check={check} />
        ))}
      </Box>
    </Box>
  );
}

export function StatusView({ signedIn }: { signedIn: boolean }) {
  const query = useStatus();
  return (
    <Box component="main" id="content" sx={{ minHeight: '100dvh' }}>
      {/* The public page has no app shell: a 56 px white bar with a bottom hairline names the product and leads
          into the app. */}
      <Box
        sx={(theme) => ({
          height: layout.appBarHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: { xs: 4, sm: 6 },
          backgroundColor: m3(theme).chrome,
          borderBottom: `1px solid ${m3(theme).border}`,
        })}
      >
        <Typography variant="subtitle1" component="p" noWrap sx={{ flex: 1, minWidth: 0 }}>
          Moderation Workbench
        </Typography>
        {/* The public page's only way into the app (03 sec. 6.12). */}
        <Button variant="ghost" href={signedIn ? '/' : '/sign-in'}>
          {signedIn ? 'Back to the app' : 'Sign in'}
        </Button>
      </Box>
      <Box sx={pageSx}>
        <Box sx={{ maxWidth: layout.workWidth, display: 'flex', flexDirection: 'column', gap: titleGap }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 3 }}
          >
            <Typography variant="h1">System status</Typography>
            <Button
              variant="secondary"
              startIcon={<RefreshRounded />}
              onClick={() => void query.refetch()}
              loading={query.isFetching}
            >
              Refresh
            </Button>
          </Box>
          <QueryState query={query} loadingLabel="Loading system status">
            {(report) => <Report report={report} />}
          </QueryState>
          <JobsAdminPanel signedIn={signedIn} />
        </Box>
      </Box>
    </Box>
  );
}
