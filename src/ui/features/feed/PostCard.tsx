'use client';

import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import LabelRounded from '@mui/icons-material/LabelRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import { useCreateComment, type FeedItem, type FeedPost } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Tag } from '../../components/Tag';
import { useSnackbar } from '../../components/SnackbarProvider';
import { m3 } from '../../theme/theme';
import { Composer } from './Composer';
import { relativeTime, shortDate } from './format';
import type { ReportTarget } from './ReportDialog';

// A post with its comments (03 sec. 6.2). Text is rendered as plain text, never as HTML (SEC-3).
// Visibility treatments (CNT-5): visible as is; labeled with a warning tag naming the clause; limited
// collapsed behind "Show anyway"; removed shown only to its author (with the appeal deadline) and to staff.

function clauseText(codes: string[]): string {
  return codes.length > 0 ? codes.join(', ') : 'the community policy';
}

/** The removed notice for the author (CNT-5): "Removed - under <clause>, you can appeal until <date>". */
export function removedNotice(item: FeedItem): string {
  const under = `Removed - under ${clauseText(item.moderation.clauseCodes)}`;
  return item.moderation.appealUntil
    ? `${under}, you can appeal until ${shortDate(item.moderation.appealUntil)}.`
    : `${under}.`;
}

function ItemHeader({ item }: { item: FeedItem }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
      <Avatar
        aria-hidden
        sx={(theme) => ({
          width: 40,
          height: 40,
          ...theme.typography.h3,
          backgroundColor: m3(theme).primaryContainer,
          color: m3(theme).onPrimaryContainer,
        })}
      >
        {item.author.name.trim().charAt(0).toUpperCase() || '?'}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="p" sx={{ overflowWrap: 'anywhere' }}>
          {item.author.name}
          {item.isOwn ? ' (you)' : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p">
          <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString('en-GB')}>
            {relativeTime(item.createdAt)}
          </time>
        </Typography>
      </Box>
    </Box>
  );
}

function ItemTags({ item }: { item: FeedItem }) {
  const tags = [];
  if (item.analysing) {
    tags.push(<Tag key="analysing" label="Analysing..." tone="neutral" icon={<HourglassTopRounded />} />);
  }
  if (item.visibility === 'labeled') {
    tags.push(
      <Tag
        key="labeled"
        label={`Warning: ${clauseText(item.moderation.clauseCodes)}`}
        tone="tertiary"
        icon={<LabelRounded />}
      />,
    );
  }
  if (item.visibility === 'limited') {
    tags.push(<Tag key="limited" label="Limited" tone="warning" icon={<VisibilityOffRounded />} />);
  }
  if (item.visibility === 'removed' && !item.isOwn) {
    tags.push(<Tag key="removed" label="Removed - staff view" tone="error" icon={<DeleteRounded />} />);
  }
  if (tags.length === 0) return null;
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{tags}</Box>;
}

function ItemBody({ item, size }: { item: FeedItem; size: 'post' | 'comment' }) {
  const [revealed, setRevealed] = useState(false);
  const bodyId = useId();
  const collapsed = item.visibility === 'limited' && !revealed;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {item.visibility === 'removed' && item.isOwn ? (
        <Box
          data-ui="section"
          role="note"
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'flex-start',
            gap: 3,
            p: 3,
            borderRadius: '12px',
            backgroundColor: m3(theme).errorContainer,
            color: m3(theme).onErrorContainer,
          })}
        >
          <DeleteRounded aria-hidden sx={{ fontSize: 20 }} />
          <Typography variant="body2">{removedNotice(item)}</Typography>
        </Box>
      ) : null}
      {collapsed ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            This {item.type} has limited reach under {clauseText(item.moderation.clauseCodes)}.
          </Typography>
          <Button variant="text" aria-controls={bodyId} aria-expanded={false} onClick={() => setRevealed(true)}>
            Show anyway
          </Button>
        </Box>
      ) : (
        <Typography
          id={bodyId}
          variant={size === 'post' ? 'body1' : 'body2'}
          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {item.body}
        </Typography>
      )}
    </Box>
  );
}

function ReportButton({ item, onReport }: { item: FeedItem; onReport: (target: ReportTarget) => void }) {
  if (item.isOwn) return null;
  if (item.viewerReported) {
    return (
      <Button variant="text" disabled startIcon={<FlagRounded />}>
        Reported
      </Button>
    );
  }
  return (
    <Button
      variant="text"
      startIcon={<FlagRounded />}
      aria-haspopup="dialog"
      aria-label={`Report ${item.type} by ${item.author.name}`}
      onClick={() => onReport({ id: item.id, type: item.type, authorName: item.author.name })}
    >
      Report
    </Button>
  );
}

export interface PostCardProps {
  post: FeedPost;
  /** Authors may comment (02 sec. 7). */
  canComment: boolean;
  onReport: (target: ReportTarget) => void;
}

export function PostCard({ post, canComment, onReport }: PostCardProps) {
  const [open, setOpen] = useState(false);
  const commentsId = useId();
  const createComment = useCreateComment(post.id);
  const notify = useSnackbar();
  const count = post.comments.length;
  const commentLabel = count > 0 ? `Comments (${count})` : 'Comment';

  return (
    <Card
      component="article"
      aria-label={`Post by ${post.author.name}`}
      sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <ItemHeader item={post} />
      <ItemTags item={post} />
      <ItemBody item={post} size="post" />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, ml: -3 }}>
        {count > 0 || canComment ? (
          <Button
            variant="text"
            startIcon={<ChatBubbleOutlineRounded />}
            aria-expanded={open}
            aria-controls={commentsId}
            onClick={() => setOpen((value) => !value)}
          >
            {commentLabel}
          </Button>
        ) : null}
        <ReportButton item={post} onReport={onReport} />
      </Box>

      {open ? (
        <Box id={commentsId} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {post.comments.map((comment) => (
            <Box
              key={comment.id}
              data-ui="section"
              component="section"
              aria-label={`Comment by ${comment.author.name}`}
              sx={(theme) => ({
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 4,
                borderRadius: '12px',
                backgroundColor: m3(theme).cardNested,
              })}
            >
              <ItemHeader item={comment} />
              <ItemTags item={comment} />
              <ItemBody item={comment} size="comment" />
              <Box sx={{ display: 'flex', ml: -3 }}>
                <ReportButton item={comment} onReport={onReport} />
              </Box>
            </Box>
          ))}
          {canComment ? (
            <Composer
              label="Write a comment"
              submitLabel="Comment"
              minRows={2}
              onSubmit={async (body) => {
                await createComment.mutateAsync(body);
                notify('Comment posted - being checked against policy.');
              }}
            />
          ) : null}
        </Box>
      ) : null}
    </Card>
  );
}
