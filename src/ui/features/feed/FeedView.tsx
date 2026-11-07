'use client';

import DynamicFeedRounded from '@mui/icons-material/DynamicFeedRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useCreatePost, useFeed } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { useSnackbar } from '../../components/SnackbarProvider';
import { RowList } from '../../components/RowList';
import { layout, pageSx, titleGap } from '../../theme/theme';
import { Composer } from './Composer';
import { PostCard } from './PostCard';
import { ReportDialog, type ReportTarget } from './ReportDialog';

// The Feed page (03 sec. 6.2): a composer card for authors, then the posts as rows in one region, newest first,
// with "Load more".
// A reading page: left-aligned next to the navigation, with a max width (03 sec. 5).

function FeedSkeleton() {
  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
      <CardSkeleton height={180} />
      <CardSkeleton height={320} />
    </Box>
  );
}

export function FeedView({ canPost }: { canPost: boolean }) {
  const feed = useFeed();
  const createPost = useCreatePost();
  const notify = useSnackbar();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  return (
    <Box data-ui="section" sx={pageSx}>
      <Box sx={{ maxWidth: layout.readingWidth, display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
        <Typography variant="h1" sx={{ mb: { xs: titleGap.xs - layout.stackGap, sm: titleGap.sm - layout.stackGap } }}>
          Feed
        </Typography>

        {canPost ? (
          <Card component="section" aria-label="New post">
            <Composer
              label="Write a post"
              submitLabel="Post"
              onSubmit={async (body) => {
                const created = await createPost.mutateAsync(body);
                notify(
                  created.policyVersion
                    ? `Posted - being checked against policy v${created.policyVersion}.`
                    : 'Posted - it will be checked against the policy.',
                );
              }}
            />
          </Card>
        ) : null}

        <QueryState
          query={feed}
          loadingLabel="Loading the feed"
          skeleton={<FeedSkeleton />}
          isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
          empty={
            <Card>
              <EmptyState
                icon={<DynamicFeedRounded />}
                title="No posts yet."
                description={canPost ? 'Write the first post above.' : 'Posts from the community will appear here.'}
              />
            </Card>
          }
        >
          {(data) => (
            <Box
              component="section"
              aria-label="Posts"
              sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}
            >
              <RowList>
                {data.pages.flatMap((page) =>
                  page.items.map((post) => (
                    <PostCard key={post.id} post={post} canComment={canPost} onReport={setReportTarget} />
                  )),
                )}
              </RowList>
              {feed.hasNextPage ? (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    variant="secondary"
                    loading={feed.isFetchingNextPage}
                    onClick={() => void feed.fetchNextPage()}
                  >
                    Load more
                  </Button>
                </Box>
              ) : null}
            </Box>
          )}
        </QueryState>
      </Box>
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </Box>
  );
}
