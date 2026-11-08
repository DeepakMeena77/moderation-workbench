'use client';

import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ApiError } from '../../api/client';
import { useCase, useReanalyze, useReopen, type CaseDetail } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { PageSectionLabel } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { StatusTag } from '../../components/ModerationTags';
import { useSnackbar } from '../../components/SnackbarProvider';
import {
  AI_PENDING,
  AiRunDetails,
  AnalysisVersions,
  ContentCard,
  DecisionSummaryCard,
  FindingsCard,
  RecommendationCard,
} from './CaseSections';
import { layout, m3, monoSx } from '../../theme/theme';
import { DecisionPanel } from './DecisionPanel';

// The case page (03 sec. 6.6). One column until the detail pane is wide enough, then a main column with a sticky
// supporting pane (recommendation and decision panel, 360 wide). A container query decides, because the pane's
// own width depends on whether the queue list sits beside it.

const SUPPORTING_PANE_MIN = 760;

function CaseSkeleton() {
  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
      <CardSkeleton height={200} />
      <CardSkeleton height={240} />
    </Box>
  );
}

function CaseActions({ detail }: { detail: CaseDetail }) {
  const reanalyze = useReanalyze(detail.id);
  const reopen = useReopen(detail.id);
  const notify = useSnackbar();
  const failed = (error: unknown) =>
    notify(error instanceof ApiError ? error.message : "Couldn't reach the server. Try again.");
  if (!detail.permissions.canReanalyze && !detail.permissions.canReopen) return null;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {detail.permissions.canReopen ? (
        <Button
          variant="secondary"
          startIcon={<LockOpenRounded />}
          loading={reopen.isPending}
          onClick={() =>
            reopen.mutate(undefined, {
              onSuccess: () => notify('Case reopened - it is back in the review queue.'),
              onError: failed,
            })
          }
        >
          Reopen for review
        </Button>
      ) : null}
      {detail.permissions.canReanalyze ? (
        <Button
          variant="secondary"
          startIcon={<RefreshRounded />}
          loading={reanalyze.isPending}
          disabled={detail.analysisPending}
          onClick={() =>
            reanalyze.mutate(undefined, {
              onSuccess: () => notify('Re-analysis queued. A new analysis version will appear here.'),
              onError: failed,
            })
          }
        >
          Re-analyse
        </Button>
      ) : null}
    </Box>
  );
}

function CaseBanners({ detail }: { detail: CaseDetail }) {
  const banners = [];
  if (detail.permissions.readOnly) {
    banners.push(
      <Banner key="readonly" icon={<AdminPanelSettingsRounded />} title="Read-only oversight">
        Admins can review cases but not decide them. Moderators make the decisions.
      </Banner>,
    );
  }
  if (detail.analysisPending || detail.status === 'pending_analysis') {
    banners.push(
      <Banner key="pending" role="status" icon={<HourglassTopRounded />}>
        Analysing... rule checks and AI review are running. This page updates by itself.
      </Banner>,
    );
  }
  const analysis = detail.analysis;
  if (analysis && (analysis.aiStatus !== 'ok' || analysis.ai === null)) {
    banners.push(
      <Banner key="ai" tone="warning" icon={<CloudOffRounded />}>
        {AI_PENDING}. Rule findings are shown - a human must decide.
      </Banner>,
    );
  }
  if (analysis?.ai?.insufficientContext) {
    banners.push(
      <Banner key="context" tone="warning">
        The AI couldn&apos;t judge this without more context - please review.
      </Banner>,
    );
  }
  return banners.length > 0 ? <>{banners}</> : null;
}

// A middle dot between spaces, built from its code point so the source stays ASCII.
const SEPARATOR = ` ${String.fromCharCode(0xb7)} `;

const ENTRY_LABEL: Record<NonNullable<CaseDetail['entry']>, string> = {
  report: 'user report',
  rules: 'flagged by rules',
  ai: 'flagged by AI',
};

/** "case 7f3k2qz . user report . priority 65" with middle dots; the short id is the end of the case id. */
export function caseContextLine(detail: Pick<CaseDetail, 'id' | 'entry' | 'priority'>): string {
  const parts = [
    `case ${detail.id.slice(-7)}`,
    detail.entry ? ENTRY_LABEL[detail.entry] : 'no findings',
    `priority ${detail.priority}`,
  ];
  return parts.join(SEPARATOR);
}

const quietLink = (t: Theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  ...t.typography.body2,
  color: m3(t).onSurfaceVariant,
  textDecoration: 'none',
  '&:hover': { color: m3(t).onSurface, textDecoration: 'underline' },
  '& svg': { fontSize: 16 },
});

/**
 * The case header (03 sec. 6.6): back to the queue and the item's full moderation history; a monospace context line
 * (short case id, how it entered the queue, priority); then the title (the page's h1) with its status tag, and
 * Re-analyse or Reopen on the right.
 */
function CaseHeader({ detail, backHref }: { detail: CaseDetail; backHref: string }) {
  const noun = detail.content.type === 'post' ? 'Post' : 'Comment';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: layout.stackGap }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 1 }}>
        <Link component={NextLink} href={backHref} scroll={false} sx={quietLink}>
          <ArrowBackRounded aria-hidden />
          Back to queue
        </Link>
        <Link component={NextLink} href={`/content/${encodeURIComponent(detail.content.id)}/history`} sx={quietLink}>
          <HistoryRounded aria-hidden />
          Full moderation history
        </Link>
      </Box>
      <Box>
        <PageSectionLabel>Moderation</PageSectionLabel>
        <Typography variant="caption" component="p" color="text.secondary" sx={monoSx}>
          {caseContextLine(detail)}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: 3,
          rowGap: 2,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 1, minWidth: 0 }}>
          <Typography variant="h1" sx={{ overflowWrap: 'anywhere' }}>
            {noun} by {detail.content.author.name}
          </Typography>
          <StatusTag status={detail.status} />
        </Box>
        <CaseActions detail={detail} />
      </Box>
    </Box>
  );
}

export function CaseBody({
  detail,
  onReload,
  backHref = '/queue',
}: {
  detail: CaseDetail;
  onReload: () => void;
  backHref?: string;
}) {
  const decisionArea = detail.permissions.canDecide ? (
    <DecisionPanel detail={detail} onReload={onReload} />
  ) : detail.decision ? (
    <DecisionSummaryCard decision={detail.decision} />
  ) : null;

  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <CaseHeader detail={detail} backHref={backHref} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: layout.stackGap,
          [`@container (min-width: ${SUPPORTING_PANE_MIN}px)`]: {
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            alignItems: 'start',
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap, minWidth: 0 }}>
          <CaseBanners detail={detail} />
          <ContentCard detail={detail} />
          <FindingsCard detail={detail} />
          <AnalysisVersions detail={detail} />
          <AiRunDetails analysis={detail.analysis} />
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: layout.stackGap,
            minWidth: 0,
            [`@container (min-width: ${SUPPORTING_PANE_MIN}px)`]: { position: 'sticky', top: layout.appBarHeight + 16 },
          }}
        >
          {detail.analysis ? (
            <RecommendationCard detail={detail} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No analysis yet. The checks start within seconds of the post.
            </Typography>
          )}
          {decisionArea}
        </Box>
      </Box>
    </Box>
  );
}

export function CaseView({ caseId, backHref }: { caseId: string; backHref?: string }) {
  const query = useCase(caseId);
  return (
    <QueryState query={query} loadingLabel="Loading the case" skeleton={<CaseSkeleton />}>
      {(detail) => <CaseBody detail={detail} onReload={() => void query.refetch()} backHref={backHref} />}
    </QueryState>
  );
}
