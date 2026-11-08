'use client';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import type { CaseEntry, CaseRow, Severity } from '../../api/hooks';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { ACTION_LABEL } from '../../components/ModerationTags';
import { DotLabel, Tag } from '../../components/Tag';
import { m3, monoSx } from '../../theme/theme';
import { relativeTime } from '../feed/format';

// The queue as a table (03 sec. 6.5), shown from 1200 px: one row per case with everything a moderator weighs
// before opening it. A row is focusable; a click or Enter opens the case. The excerpt is also a link, so the case
// has a name for assistive technology and can open in a new tab.

export const ENTRY_LABEL: Record<CaseEntry, string> = { report: 'Report', rules: 'Rules', ai: 'AI' };

const SEVERITY_WORD: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** The first reason a human must decide, and how many more there are ("2 more"), or null when there are none. */
export function firstReason(reasons: readonly string[]): { text: string; more: string | null } | null {
  const [first] = reasons;
  if (!first) return null;
  return { text: first, more: reasons.length > 1 ? `${reasons.length - 1} more` : null };
}

function PriorityCell({ priority }: { priority: number }) {
  const value = Math.min(100, Math.max(0, priority));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }} title="Queue priority, 0-100">
      <Box
        aria-hidden
        sx={(t) => ({
          width: 24,
          height: 4,
          flexShrink: 0,
          borderRadius: '2px',
          backgroundColor: m3(t).border,
          overflow: 'hidden',
        })}
      >
        <Box
          sx={(t) => ({
            height: '100%',
            width: `${value}%`,
            backgroundColor: value >= 75 ? m3(t).error : m3(t).onSurfaceVariant,
          })}
        />
      </Box>
      <Box component="span" sx={{ ...monoSx, whiteSpace: 'nowrap' }}>
        {priority}
      </Box>
    </Box>
  );
}

function ContentCell({ row, href }: { row: CaseRow; href: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Link
        component={NextLink}
        href={href}
        scroll={false}
        tabIndex={-1}
        underline="hover"
        sx={(t) => ({
          color: m3(t).onSurface,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        })}
      >
        {row.content.excerpt}
      </Link>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Tag label={row.content.type === 'post' ? 'Post' : 'Comment'} />
        {row.reportCount > 0 ? (
          <Tag label={`${row.reportCount} ${row.reportCount === 1 ? 'report' : 'reports'}`} />
        ) : null}
      </Box>
    </Box>
  );
}

function Muted({ children }: { children: string }) {
  return (
    <Typography variant="body2" component="span" color="text.secondary">
      {children}
    </Typography>
  );
}

function columns(hrefFor: (row: CaseRow) => string): Array<DataColumn<CaseRow>> {
  return [
    { key: 'priority', header: 'Priority', width: '9%', render: (row) => <PriorityCell priority={row.priority} /> },
    { key: 'content', header: 'Content', width: '21%', render: (row) => <ContentCell row={row} href={hrefFor(row)} /> },
    {
      key: 'source',
      header: 'Source',
      width: '8%',
      render: (row) => (row.entry ? ENTRY_LABEL[row.entry] : <Muted>-</Muted>),
    },
    {
      key: 'action',
      header: 'Proposed action',
      width: '9%',
      render: (row) =>
        row.analysis ? (
          ACTION_LABEL[row.analysis.action]
        ) : (
          <Muted>{row.status === 'pending_analysis' ? 'Analysing...' : '-'}</Muted>
        ),
    },
    {
      key: 'severity',
      header: 'Severity',
      width: '9%',
      render: (row) =>
        row.analysis?.severity ? (
          <DotLabel tone={row.analysis.severity} size="body">
            {SEVERITY_WORD[row.analysis.severity]}
          </DotLabel>
        ) : (
          <Muted>None</Muted>
        ),
    },
    {
      key: 'confidence',
      header: 'Confidence',
      width: '11%',
      render: (row) =>
        row.analysis?.confidence !== null && row.analysis?.confidence !== undefined ? (
          <Box component="span" sx={monoSx}>
            {row.analysis.confidence.toFixed(2)}
          </Box>
        ) : (
          <Muted>-</Muted>
        ),
    },
    {
      key: 'why',
      header: 'Why a human',
      width: '17%',
      render: (row) => {
        const reason = firstReason(row.analysis?.reasons ?? []);
        if (!reason) return <Muted>-</Muted>;
        return (
          <Box>
            {reason.text}
            {reason.more ? (
              <Typography
                variant="caption"
                component="span"
                sx={(t) => ({ color: m3(t).textTertiary, ml: 1, whiteSpace: 'nowrap' })}
              >
                {reason.more}
              </Typography>
            ) : null}
          </Box>
        );
      },
    },
    {
      key: 'policy',
      header: 'Policy',
      width: '8%',
      render: (row) =>
        row.analysis ? (
          <Box component="span" sx={monoSx}>
            v{row.analysis.policyVersion}
          </Box>
        ) : (
          <Muted>-</Muted>
        ),
    },
    {
      key: 'age',
      header: 'Age',
      width: '8%',
      render: (row) => (
        <Typography variant="body2" component="span" color="text.secondary">
          <time dateTime={row.createdAt}>{relativeTime(row.createdAt)}</time>
        </Typography>
      ),
    },
  ];
}

export function QueueTable({ rows, search }: { rows: CaseRow[]; search: string }) {
  const router = useRouter();
  const hrefFor = (row: CaseRow) => `/queue/${row.id}${search}`;
  return (
    <DataTable
      caption="Cases, highest priority first"
      columns={columns(hrefFor)}
      rows={rows}
      rowKey={(row) => row.id}
      onRowOpen={(row) => router.push(hrefFor(row), { scroll: false })}
    />
  );
}
