'use client';

import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import FilterAltOffRounded from '@mui/icons-material/FilterAltOffRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import InboxRounded from '@mui/icons-material/InboxRounded';
import ReportRounded from '@mui/icons-material/ReportRounded';
import TouchAppRounded from '@mui/icons-material/TouchAppRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { queueSearch, useCases, type CaseRow, type QueueFilters, type Severity } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { FilterChip } from '../../components/FilterChip';
import { IconButton } from '../../components/IconButton';
import { QueryState } from '../../components/QueryState';
import { SearchBar } from '../../components/SearchBar';
import { Tag } from '../../components/Tag';
import { m3 } from '../../theme/theme';
import { CaseView } from '../case/CaseView';
import { relativeTime } from '../feed/format';
import { hasNarrowingFilters, parseQueueFilters } from './queueFilters';

// The Queue page (03 sec. 6.5, Q-1, Q-3) as a list-detail layout (03 sec. 5.1): below 840 px the list and the
// case are separate screens (/queue and /queue/[caseId]); from 840 px the case opens beside the list. Panes are
// switched with CSS, so the server render and the first client render agree. Filters and search are in the URL.

function severityStyle(theme: Theme, severity: Severity | null): { bg: string; fg: string } {
  const p = m3(theme);
  if (severity === 'high') return { bg: p.errorContainer, fg: p.onErrorContainer };
  if (severity === 'medium') return { bg: p.warningContainer, fg: p.onWarningContainer };
  if (severity === 'low') return { bg: p.secondaryContainer, fg: p.onSecondaryContainer };
  return { bg: p.surfaceContainerHighest, fg: p.onSurfaceVariant };
}

const SEVERITY_WORD: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** "High, Post, Alex, HAR-1, PII-1, 2 reports" (03 sec. 6.5). */
export function rowSupportingText(row: CaseRow): string {
  const parts = [
    row.analysis?.severity ? SEVERITY_WORD[row.analysis.severity] : 'No findings',
    row.content.type === 'post' ? 'Post' : 'Comment',
    row.content.authorName,
    ...(row.analysis?.clauseCodes ?? []),
  ];
  if (row.reportCount > 0) parts.push(`${row.reportCount} ${row.reportCount === 1 ? 'report' : 'reports'}`);
  if (row.status === 'pending_analysis') parts.push('Analysing...');
  return parts.join(', ');
}

function QueueRow({ row, selected, href }: { row: CaseRow; selected: boolean; href: string }) {
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        component={NextLink}
        href={href}
        scroll={false}
        aria-current={selected ? 'page' : undefined}
        data-ui="section"
        sx={(t) => {
          const sev = severityStyle(t, row.analysis?.severity ?? null);
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
            '& .severity-dot': { backgroundColor: sev.bg, color: sev.fg },
          };
        }}
      >
        <Box
          className="severity-dot"
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The icon repeats the severity word in the supporting text; it is decorative. */}
          <SeverityIcon severity={row.analysis?.severity ?? null} />
        </Box>
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
            {rowSupportingText(row)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
          <Tag
            label={`P ${row.priority}`}
            tone={row.priority >= 75 ? 'error' : 'neutral'}
            title="Queue priority, 0-100"
          />
          <Typography variant="caption" color="text.secondary">
            <time dateTime={row.createdAt}>{relativeTime(row.createdAt)}</time>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function SeverityIcon({ severity }: { severity: Severity | null }) {
  if (severity === 'high') return <ReportRounded />;
  if (severity === 'medium') return <WarningRounded />;
  return <InfoRounded />;
}

const STATUS_CHIPS: Array<{ status: QueueFilters['status']; label: string }> = [
  { status: 'awaiting_review', label: 'Needs review' },
  { status: 'pending_analysis', label: 'Analysing' },
  { status: 'auto_cleared', label: 'Auto-cleared' },
];

function FilterRow({ filters, onChange }: { filters: QueueFilters; onChange: (next: QueueFilters) => void }) {
  const toggle = <K extends 'severity' | 'trigger' | 'ai'>(key: K, value: NonNullable<QueueFilters[K]>) =>
    onChange({ ...filters, [key]: filters[key] === value ? undefined : value });
  return (
    <Box
      role="toolbar"
      aria-label="Filters"
      sx={{ display: 'flex', flexWrap: { xs: 'nowrap', sm: 'wrap' }, gap: 2, overflowX: 'auto', pb: 1 }}
    >
      {STATUS_CHIPS.map((chip) => (
        <FilterChip
          key={chip.status}
          label={chip.label}
          selected={filters.status === chip.status}
          aria-pressed={filters.status === chip.status}
          onClick={() => onChange({ ...filters, status: chip.status })}
        />
      ))}
      <FilterChip
        label="High"
        selected={filters.severity === 'high'}
        aria-pressed={filters.severity === 'high'}
        onClick={() => toggle('severity', 'high')}
      />
      <FilterChip
        label="Reported"
        selected={filters.trigger === 'report'}
        aria-pressed={filters.trigger === 'report'}
        onClick={() => toggle('trigger', 'report')}
      />
      <FilterChip
        label="AI unavailable"
        selected={filters.ai === 'unavailable'}
        aria-pressed={filters.ai === 'unavailable'}
        onClick={() => toggle('ai', 'unavailable')}
      />
      {filters.policy ? (
        <FilterChip
          label={`Policy v${filters.policy}`}
          selected
          aria-pressed
          onClick={() => onChange({ ...filters, policy: undefined })}
        />
      ) : null}
    </Box>
  );
}

function QueueEmpty({ filters, onClear }: { filters: QueueFilters; onClear: () => void }) {
  if (hasNarrowingFilters(filters)) {
    return (
      <EmptyState
        icon={<FilterAltOffRounded />}
        title={filters.q ? `No cases match '${filters.q}'.` : 'No cases match these filters.'}
        action={
          <Button variant="tonal" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  if (filters.status === 'pending_analysis') {
    return (
      <EmptyState title="Nothing is being analysed right now." description="New posts are checked within seconds." />
    );
  }
  if (filters.status === 'auto_cleared') {
    return (
      <EmptyState title="No auto-cleared cases." description="Cases the AI cleared with confidence appear here." />
    );
  }
  return (
    <EmptyState icon={<InboxRounded />} title="Queue is clear." description="New posts and reports will appear here." />
  );
}

export function QueueView({ selectedId }: { selectedId: string | null }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = useMemo(() => parseQueueFilters(searchParams), [searchParams]);
  const cases = useCases(filters);
  const search = queueSearch(filters);

  const setFilters = useCallback(
    (next: QueueFilters) => router.replace(`${pathname}${queueSearch(next)}`, { scroll: false }),
    [pathname, router],
  );
  const onSearch = useCallback((q: string) => setFilters({ ...filters, q: q || undefined }), [filters, setFilters]);
  const clear = () => setFilters({ status: filters.status });

  const loaded = cases.data?.pages.flatMap((page) => page.items) ?? [];
  const total = cases.data?.pages[0]?.total ?? 0;

  return (
    <Box data-ui="section" sx={{ px: { xs: 4, sm: 6 }, py: 6 }}>
      <Box sx={{ display: { xs: selectedId ? 'none' : 'block', md: 'block' }, mb: 4 }}>
        <Typography variant="h1">Queue</Typography>
      </Box>
      {selectedId ? (
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 2, mb: 4, ml: -3 }}>
          <IconButton label="Back to the queue" onClick={() => router.push(`/queue${search}`, { scroll: false })}>
            <ArrowBackRounded />
          </IconButton>
          <Typography variant="h1">Case review</Typography>
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
          aria-label="Cases"
          sx={{
            display: { xs: selectedId ? 'none' : 'flex', md: 'flex' },
            flexDirection: 'column',
            gap: 4,
            minWidth: 0,
          }}
        >
          <SearchBar
            value={filters.q ?? ''}
            onSearch={onSearch}
            label="Search cases"
            placeholder="Search text, author or clause (e.g. HAR-1)"
          />
          <FilterRow filters={filters} onChange={setFilters} />
          <QueryState
            query={cases}
            loadingLabel="Loading the queue"
            isEmpty={(data) => (data.pages[0]?.items.length ?? 0) === 0}
            empty={
              <Card>
                <QueueEmpty filters={filters} onClear={clear} />
              </Card>
            }
          >
            {() => (
              <>
                <Box component="ul" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {loaded.map((row) => (
                    <QueueRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      href={`/queue/${row.id}${search}`}
                    />
                  ))}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" role="status">
                    Showing {loaded.length} of {total}
                  </Typography>
                  {cases.hasNextPage ? (
                    <Button
                      variant="tonal"
                      loading={cases.isFetchingNextPage}
                      onClick={() => void cases.fetchNextPage()}
                    >
                      Load more
                    </Button>
                  ) : null}
                </Box>
              </>
            )}
          </QueryState>
        </Box>

        <Box
          component="section"
          aria-label="Case"
          sx={{ display: { xs: selectedId ? 'block' : 'none', md: 'block' }, minWidth: 0 }}
        >
          {selectedId ? (
            <CaseView caseId={selectedId} />
          ) : (
            <Card>
              <EmptyState icon={<TouchAppRounded />} title="Select a case to review it here." />
            </Card>
          )}
        </Box>
      </Box>
    </Box>
  );
}
