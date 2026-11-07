'use client';

import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import PsychologyRounded from '@mui/icons-material/PsychologyRounded';
import RuleRounded from '@mui/icons-material/RuleRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactElement } from 'react';
import { useHistory, type ContentHistory, type HistoryEvent, type HistoryEventKind } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { IconButton } from '../../components/IconButton';
import { ActionTag, PolicyVersionTag, StatusTag } from '../../components/ModerationTags';
import { QueryState } from '../../components/QueryState';
import { layout, pageSx } from '../../theme/theme';
import { CardSkeleton } from '../../components/Skeletons';
import { Timeline } from '../../components/Timeline';
import { relativeTime } from '../feed/format';

// The moderation history page (03 sec. 6.4, CNT-4). The server already shaped the events for the viewer: the
// author's view is plain language with no AI internals, staff names or reporters; staff also get facts and the
// raw audit trail. Everything is rendered as plain text (SEC-3).

const ICONS: Record<HistoryEventKind, ReactElement<SvgIconProps>> = {
  created: <EditNoteRounded />,
  reported: <FlagRounded />,
  analysis: <RuleRounded />,
  decision: <GavelRounded />,
  visibility: <VisibilityRounded />,
  appeal: <ForumRounded />,
  appeal_assigned: <PersonSearchRounded />,
  appeal_brief: <PsychologyRounded />,
  appeal_resolved: <VerifiedRounded />,
};

function EventBody({ event }: { event: HistoryEvent }) {
  return (
    <>
      {event.action || event.policyVersion ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {event.action ? <ActionTag action={event.action} /> : null}
          {event.policyVersion ? <PolicyVersionTag version={event.policyVersion} /> : null}
        </Box>
      ) : null}
      {event.lines.map((line, i) => (
        <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {line}
        </Typography>
      ))}
      {event.facts && event.facts.length > 0 ? (
        <Box
          component="dl"
          sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', columnGap: 3 }}
        >
          {event.facts.map((f) => (
            <Box key={f.label} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="caption" color="text.secondary">
                {f.label}
              </Typography>
              <Typography component="dd" variant="caption" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                {f.value}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}
    </>
  );
}

function AuditTrail({ events }: { events: NonNullable<ContentHistory['auditEvents']> }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card component="section" aria-label="Audit events" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Button
          variant="text"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none' }} />}
          sx={{ ml: -3 }}
        >
          Audit events ({events.length})
        </Button>
      </Box>
      <Collapse in={open} id={id} unmountOnExit>
        <Box component="ol" sx={{ m: 0, pl: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {events.map((e) => (
            <Typography key={e.id} component="li" variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              <time dateTime={e.at}>{relativeTime(e.at)}</time> - {e.action} by{' '}
              {e.actorName ?? (e.actorType === 'ai' ? 'the AI' : 'the system')} ({e.entityType} #{e.id})
            </Typography>
          ))}
        </Box>
      </Collapse>
    </Card>
  );
}

export function HistoryBody({ history }: { history: ContentHistory }) {
  const headingId = useId();
  const noun = history.content.type === 'post' ? 'Post' : 'Comment';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
      <Card component="section" aria-labelledby={headingId} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          <Typography id={headingId} variant="h3" component="h2">
            {history.content.authorName ? `${noun} by ${history.content.authorName}` : `Your ${noun.toLowerCase()}`}
          </Typography>
          {history.caseStatus && history.view === 'staff' ? <StatusTag status={history.caseStatus} /> : null}
        </Box>
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {history.content.body}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <time dateTime={history.content.createdAt}>{relativeTime(history.content.createdAt)}</time> | visible to
          others as: {history.content.visibility}
        </Typography>
      </Card>
      <Card component="section" aria-label="Timeline" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h3" component="h2">
          Timeline
        </Typography>
        <Timeline
          label="Moderation events, oldest first"
          entries={history.events.map((event) => ({
            id: event.id,
            at: event.at,
            icon: ICONS[event.kind],
            title: event.title,
            children: <EventBody event={event} />,
          }))}
        />
      </Card>
      {history.auditEvents ? <AuditTrail events={history.auditEvents} /> : null}
    </Box>
  );
}

export function HistoryView({ contentId }: { contentId: string }) {
  const query = useHistory(contentId);
  const router = useRouter();
  return (
    <Box data-ui="section" sx={pageSx}>
      <Box sx={{ maxWidth: layout.readingWidth, display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: -3, my: -1 }}>
          <IconButton label="Back" onClick={() => router.back()}>
            <ArrowBackRounded />
          </IconButton>
          <Typography variant="h1">Moderation history</Typography>
        </Box>
        <QueryState
          query={query}
          loadingLabel="Loading the history"
          skeleton={
            <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: layout.stackGap }}>
              <CardSkeleton height={140} />
              <CardSkeleton height={280} />
            </Box>
          }
        >
          {(history) => <HistoryBody history={history} />}
        </QueryState>
      </Box>
    </Box>
  );
}
