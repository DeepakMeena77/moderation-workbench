'use client';

import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import TouchAppRounded from '@mui/icons-material/TouchAppRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAppeals, type AppealRow, type AppealStatus } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { FilterChip } from '../../components/FilterChip';
import { IconButton } from '../../components/IconButton';
import { ACTION_LABEL } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { Tag } from '../../components/Tag';
import { m3 } from '../../theme/theme';
import { relativeTime } from '../feed/format';
import { AppealReview } from './AppealReview';

// The appeals page (03 sec. 6.7) as list-detail (03 sec. 5.1): below 840 px the list and the review are separate
// screens (/appeals and /appeals/[id]); from 840 px the review opens beside the list. "Assigned to you" comes
// first, then waiting age. A warning banner shows when an appeal has no eligible reviewer (APP-3).

/** "Post, Asha Rao, limited under HAR-1 by Dana Okafor" */
export function appealSupportingText(row: AppealRow): string {
  const action = ACTION_LABEL[row.decision.finalAction].toLowerCase();
  const under = row.decision.clauseCodes.length > 0 ? ` under ${row.decision.clauseCodes.join(', ')}` : '';
  return `${row.content.type === 'post' ? 'Post' : 'Comment'}, ${row.content.authorName}, ${action}${under} by ${row.decision.deciderName}`;
}

function RowTag({ row }: { row: AppealRow }) {
  if (row.status === 'resolved' && row.outcome) {
    const word = { uphold: 'Upheld', overturn: 'Overturned', modify: 'Modified' }[row.outcome];
    return <Tag label={word} tone="secondary" />;
  }
  if (row.ownDecision) return <Tag label="Your decision" tone="warning" />;
  if (row.assignedToMe) return <Tag label="Assigned to you" tone="primary" icon={<PersonRounded />} />;
  if (!row.assignedReviewer) return <Tag label="Unassigned" tone="error" />;
  return null;
}

function AppealListRow({ row, selected, href }: { row: AppealRow; selected: boolean; href: string }) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        component={NextLink}
        href={href}
        scroll={false}
        aria-current={selected ? 'page' : undefined}
        data-ui="section"
        sx={(t) => {
          const bg = selected ? m3(t).selected : m3(t).card;
          return {
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minHeight: 88,
            px: 4,
            py: 3,
            borderRadius: '12px',
            backgroundColor: bg,
            color: m3(t).onSurface,
            textDecoration: 'none',
            '&:hover': { backgroundColor: `color-mix(in srgb, ${m3(t).onSurface} 8%, ${bg})` },
          };
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            component="p"
            sx={{
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {row.content.excerpt}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
            {appealSupportingText(row)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
          <RowTag row={row} />
          <Typography variant="caption" color="text.secondary">
            <time dateTime={row.resolvedAt ?? row.createdAt}>{relativeTime(row.resolvedAt ?? row.createdAt)}</time>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export function AppealsView({ selectedId }: { selectedId: string | null }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const status: AppealStatus = searchParams.get('status') === 'resolved' ? 'resolved' : 'pending';
  const search = status === 'resolved' ? '?status=resolved' : '';
  const appeals = useAppeals(status);

  return (
    <Box data-ui="section" sx={{ px: { xs: 4, sm: 6 }, py: 6 }}>
      <Box sx={{ display: { xs: selectedId ? 'none' : 'block', md: 'block' }, mb: 4 }}>
        <Typography variant="h1">Appeals</Typography>
      </Box>
      {selectedId ? (
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 2, mb: 4, ml: -3 }}>
          <IconButton label="Back to appeals" onClick={() => router.push(`/appeals${search}`, { scroll: false })}>
            <ArrowBackRounded />
          </IconButton>
          <Typography variant="h1">Appeal review</Typography>
        </Box>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '360px minmax(0, 1fr)', lg: '400px minmax(0, 1fr)' },
          gap: 6,
          alignItems: 'start',
        }}
      >
        <Box
          component="section"
          aria-label="Appeals list"
          sx={{
            display: { xs: selectedId ? 'none' : 'flex', md: 'flex' },
            flexDirection: 'column',
            gap: 4,
            minWidth: 0,
          }}
        >
          <Box role="toolbar" aria-label="Filters" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {(['pending', 'resolved'] as const).map((value) => (
              <FilterChip
                key={value}
                label={value === 'pending' ? 'Waiting' : 'Resolved'}
                selected={status === value}
                aria-pressed={status === value}
                onClick={() =>
                  router.replace(`${pathname}${value === 'resolved' ? '?status=resolved' : ''}`, { scroll: false })
                }
              />
            ))}
          </Box>
          {appeals.data && appeals.data.unassigned > 0 ? (
            <Banner tone="warning" role="status">
              {appeals.data.unassigned === 1 ? '1 appeal has' : `${appeals.data.unassigned} appeals have`} no eligible
              reviewer: no senior moderator other than the original decider was available. Any senior moderator who did
              not decide may still resolve it.
            </Banner>
          ) : null}
          <QueryState
            query={appeals}
            loadingLabel="Loading appeals"
            isEmpty={(data) => data.items.length === 0}
            empty={
              <Card>
                <EmptyState
                  icon={<ForumRounded />}
                  title={status === 'pending' ? 'No appeals waiting.' : 'No resolved appeals yet.'}
                  description={
                    status === 'pending' ? 'Appeals from authors appear here for a second review.' : undefined
                  }
                />
              </Card>
            }
          >
            {(data) => (
              <>
                <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.items.map((row) => (
                    <AppealListRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      href={`/appeals/${row.id}${search}`}
                    />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary" role="status">
                  Showing {data.items.length} of {data.total}
                </Typography>
              </>
            )}
          </QueryState>
        </Box>

        <Box
          component="section"
          aria-label="Appeal"
          sx={{ display: { xs: selectedId ? 'block' : 'none', md: 'block' }, minWidth: 0 }}
        >
          {selectedId ? (
            <AppealReview appealId={selectedId} />
          ) : (
            <Card>
              <EmptyState icon={<TouchAppRounded />} title="Select an appeal to review it here." />
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}
