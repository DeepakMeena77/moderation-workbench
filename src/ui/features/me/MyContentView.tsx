'use client';

import ArticleRounded from '@mui/icons-material/ArticleRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import PendingActionsRounded from '@mui/icons-material/PendingActionsRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import Box from '@mui/material/Box';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useState, type ReactElement } from 'react';
import { useMyContent, type CaseStatus, type MyContentItem } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ActionTag } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { Tag, type TagTone } from '../../components/Tag';
import { layout, m3, pageSx } from '../../theme/theme';
import { relativeTime, shortDate } from '../feed/format';
import { AppealDialog, type AppealTarget } from './AppealDialog';

// My content (03 sec. 6.3, APP-1, APP-5): the author's own items with a status tag, the action, the decision in
// plain words and a tonal Appeal button with its deadline. The appeal state and outcome are shown inline. Status
// words are the author's, not the moderators' queue words.

const AUTHOR_STATUS: Record<CaseStatus, { label: string; tone: TagTone; icon: ReactElement<SvgIconProps> }> = {
  pending_analysis: { label: 'Being checked', tone: 'neutral', icon: <HourglassTopRounded /> },
  awaiting_review: { label: 'Waiting for review', tone: 'primary', icon: <PendingActionsRounded /> },
  auto_cleared: { label: 'No issues found', tone: 'success', icon: <TaskAltRounded /> },
  resolved: { label: 'Reviewed', tone: 'secondary', icon: <GavelRounded /> },
  appealed: { label: 'Appeal pending', tone: 'tertiary', icon: <ForumRounded /> },
  appeal_resolved: { label: 'Appeal resolved', tone: 'secondary', icon: <VerifiedRounded /> },
};

/** The action in force now: the appeal's final action once it is resolved, otherwise the decision's. */
function currentAction(item: MyContentItem) {
  if (item.appeal?.status === 'resolved' && item.appeal.finalAction) return item.appeal.finalAction;
  return item.decision?.finalAction ?? null;
}

function ContentRow({ item, onAppeal }: { item: MyContentItem; onAppeal: (target: AppealTarget) => void }) {
  const status = item.caseStatus ? AUTHOR_STATUS[item.caseStatus] : null;
  const action = currentAction(item);
  const window = item.appealability;
  const noun = item.type === 'post' ? 'Post' : 'Comment';
  return (
    <Card
      component="li"
      aria-label={`${noun}, ${relativeTime(item.createdAt)}`}
      sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {noun}, <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
        </Typography>
        {status ? <Tag label={status.label} tone={status.tone} icon={status.icon} /> : null}
        {action && action !== 'none' ? <ActionTag action={action} /> : null}
      </Box>
      <Typography
        variant="body1"
        sx={{
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.body}
      </Typography>
      {item.decision ? (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {item.decision.summary}
        </Typography>
      ) : null}
      {item.appeal ? (
        <Box
          data-ui="section"
          role="group"
          aria-label="Your appeal"
          sx={(t) => ({ p: 3, borderRadius: `${layout.nestedRadius}px`, backgroundColor: m3(t).cardNested })}
        >
          <Typography variant="h4" component="p">
            {item.appeal.status === 'pending' ? 'Appeal pending' : 'Appeal outcome'}
          </Typography>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {item.appeal.summary}
          </Typography>
        </Box>
      ) : null}
      {!item.appeal && window && !window.canAppeal && window.reason && item.decision?.finalAction !== 'none' ? (
        <Typography variant="caption" color="text.secondary" component="p">
          {window.reason}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: -1 }}>
        {window?.canAppeal && item.decision ? (
          <Button variant="tonal" onClick={() => onAppeal({ item, decisionId: item.decision?.id ?? '' })}>
            Appeal{window.until ? ` - until ${shortDate(window.until)}` : ''}
          </Button>
        ) : null}
        <Button
          variant="text"
          href={`/content/${encodeURIComponent(item.id)}/history`}
          LinkComponent={NextLink}
          startIcon={<HistoryRounded />}
        >
          History
        </Button>
      </Box>
    </Card>
  );
}

export function MyContentView() {
  const query = useMyContent();
  const [target, setTarget] = useState<AppealTarget | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Box data-ui="section" sx={pageSx}>
      <Box sx={{ maxWidth: layout.readingWidth, display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
        <Typography variant="h1" sx={{ mb: { xs: 0, sm: 1 } }}>
          My content
        </Typography>
        <QueryState
          query={query}
          loadingLabel="Loading your content"
          isEmpty={(data) => (data.pages[0]?.items.length ?? 0) === 0}
          empty={
            <Card>
              <EmptyState
                icon={<ArticleRounded />}
                title="You haven't posted yet."
                action={
                  <Button variant="tonal" href="/feed" LinkComponent={NextLink}>
                    Write a post
                  </Button>
                }
              />
            </Card>
          }
        >
          {() => (
            <>
              <Box
                component="ul"
                aria-label="Your posts and comments"
                sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: layout.stackGap }}
              >
                {items.map((item) => (
                  <ContentRow key={item.id} item={item} onAppeal={setTarget} />
                ))}
              </Box>
              {query.hasNextPage ? (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Button variant="tonal" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                    Load more
                  </Button>
                </Box>
              ) : null}
            </>
          )}
        </QueryState>
      </Box>
      <AppealDialog target={target} onClose={() => setTarget(null)} />
    </Box>
  );
}
