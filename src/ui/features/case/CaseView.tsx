'use client';

import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client';
import { useCase, useReanalyze, useReopen, type CaseDetail } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { StatusTag } from '../../components/ModerationTags';
import { Tag } from '../../components/Tag';
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
import { layout } from '../../theme/theme';
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

/** Header actions sit in the chip row, so they keep tight side padding next to the 24 dp tags. */
const COMPACT_BUTTON = { pr: 4 } as const;

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
          variant="tonal"
          startIcon={<LockOpenRounded />}
          sx={COMPACT_BUTTON}
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
          variant="tonal"
          startIcon={<RefreshRounded />}
          sx={COMPACT_BUTTON}
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

export function CaseBody({ detail, onReload }: { detail: CaseDetail; onReload: () => void }) {
  const decisionArea = detail.permissions.canDecide ? (
    <DecisionPanel detail={detail} onReload={onReload} />
  ) : detail.decision ? (
    <DecisionSummaryCard decision={detail.decision} />
  ) : null;

  return (
    <Box sx={{ containerType: 'inline-size' }}>
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
          {/* One header row: status and priority on the left, actions on the right. When it wraps (phones), the
              actions start a new line at the left edge, under the tags. */}
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
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
              <StatusTag status={detail.status} />
              <Tag label={`P ${detail.priority}`} tone="neutral" title="Queue priority, 0-100" />
            </Box>
            <CaseActions detail={detail} />
          </Box>
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

export function CaseView({ caseId }: { caseId: string }) {
  const query = useCase(caseId);
  return (
    <QueryState query={query} loadingLabel="Loading the case" skeleton={<CaseSkeleton />}>
      {(detail) => <CaseBody detail={detail} onReload={() => void query.refetch()} />}
    </QueryState>
  );
}
