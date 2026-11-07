'use client';

import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import type { ReactElement } from 'react';
import { useStatus, type CheckState, type StatusCheck, type StatusReport } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { Tag, type TagTone } from '../../components/Tag';

// Public status page (docs/03-ui-ux.md sec. 6.12). S0 shows the app and database checks; S7 adds the rest.

const STATE_TAG: Record<CheckState, { label: string; tone: TagTone; icon: ReactElement<SvgIconProps> }> = {
  ok: { label: 'Operational', tone: 'success', icon: <CheckCircleRounded /> },
  warn: { label: 'Degraded', tone: 'warning', icon: <WarningRounded /> },
  fail: { label: 'Down', tone: 'error', icon: <ErrorRounded /> },
};

const OVERALL_TEXT: Record<CheckState, string> = {
  ok: 'All systems operational',
  warn: 'Degraded: some checks need attention',
  fail: 'Outage: at least one check is failing',
};

const CHECK_TITLE: Record<string, string> = { app: 'App', database: 'Database' };

const DETAIL_LABEL: Record<string, string> = {
  release: 'Release',
  buildTime: 'Built',
  uptimeS: 'Uptime (s)',
  latencyMs: 'Latency (ms)',
  reason: 'Reason',
};

function formatDetail(key: string, value: string | number | null): string {
  if (value === null) return '-';
  if (key === 'release' && typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)) return value.slice(0, 7);
  return String(value);
}

function CheckCard({ check }: { check: StatusCheck }) {
  const tag = STATE_TAG[check.state];
  const title = CHECK_TITLE[check.check] ?? check.check;
  return (
    <Card component="section" aria-label={`${title} check`}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        <Tag label={tag.label} tone={tag.tone} icon={tag.icon} />
      </Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 4, rowGap: 1 }}>
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

function Report({ report }: { report: StatusReport }) {
  const overall = STATE_TAG[report.overall];
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Card>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
          <Tag label={overall.label} tone={overall.tone} icon={overall.icon} />
          <Typography variant="body1">{OVERALL_TEXT[report.overall]}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
          Checked at {new Date(report.checkedAt).toLocaleTimeString()}. Refreshes every 30 seconds.
        </Typography>
      </Card>
      <Box
        sx={{
          display: 'grid',
          gap: 4,
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

export function StatusView() {
  const query = useStatus();
  return (
    <Box component="main" id="content" sx={{ minHeight: '100dvh', px: { xs: 4, sm: 6 }, py: 6 }}>
      <Box sx={{ maxWidth: 1600, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 3 }}>
          <Box>
            <Typography variant="overline" component="p" color="text.secondary">
              Moderation Workbench
            </Typography>
            <Typography variant="h1">System status</Typography>
          </Box>
          <Button
            variant="tonal"
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
      </Box>
    </Box>
  );
}
