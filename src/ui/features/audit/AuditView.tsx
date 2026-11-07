'use client';

import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FilterAltOffRounded from '@mui/icons-material/FilterAltOffRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { FilterChip } from '../../components/FilterChip';
import { IconButton } from '../../components/IconButton';
import { QueryState } from '../../components/QueryState';
import { SearchBar } from '../../components/SearchBar';
import { CardSkeleton } from '../../components/Skeletons';
import { m3 } from '../../theme/theme';
import { shortDateTime } from '../feed/format';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  useAuditEvents,
  useAuditVerify,
  type ActorType,
  type AuditFilters,
  type AuditRow,
} from './api';
import { auditSearch, hasAuditFilters, parseAuditFilters, rangeError } from './auditFilters';

// The Audit page (03 sec. 6.10; AUD-3, AUD-5): the integrity banner, filters in the URL, search, a table from
// 840 px and a list below it. A row expands to its before and after summaries as plain text in the theme font
// (the style audit allows only Roboto). The table and the list are switched with CSS, so the server render and
// the first client render agree.

const ACTOR_CHIPS: Array<{ value: ActorType; label: string }> = [
  { value: 'human', label: 'People' },
  { value: 'system', label: 'System' },
  { value: 'ai', label: 'AI' },
];

const ACTOR_TYPE_WORD: Record<ActorType, string> = { human: 'Person', system: 'System', ai: 'AI' };

function actorLabel(row: AuditRow): string {
  if (row.actorName) return row.actorName;
  if (row.actorType === 'human') return 'Unknown user';
  return ACTOR_TYPE_WORD[row.actorType];
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso}>
      {shortDateTime(iso)}
    </time>
  );
}

function IntegrityBanner({ onShowEvent }: { onShowEvent: (id: string) => void }) {
  const verify = useAuditVerify();
  return (
    <QueryState query={verify} loadingLabel="Checking the audit chain" skeleton={<CardSkeleton height={56} />}>
      {(result) =>
        result.intact ? (
          <Banner tone="success" role="status">
            Audit chain intact, {plural(result.checked, 'event')} verified.
          </Banner>
        ) : (
          <Banner
            tone="error"
            role="alert"
            title="Audit chain broken"
            action={
              result.firstBrokenId ? (
                <Button variant="tonal" onClick={() => onShowEvent(result.firstBrokenId ?? '')}>
                  Show event
                </Button>
              ) : null
            }
          >
            Event #{result.firstBrokenId} does not match the chain ({plural(result.checked, 'event')} checked). It and
            the events after it cannot be trusted.
          </Banner>
        )
      }
    </QueryState>
  );
}

function Summary({ label, value }: { label: string; value: unknown }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
        {label}
      </Typography>
      {value === null || value === undefined ? (
        <Typography variant="body2" color="text.secondary">
          None
        </Typography>
      ) : (
        <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(value, null, 2)}
        </Typography>
      )}
    </Box>
  );
}

function EventDetails({ row }: { row: AuditRow }) {
  const facts: Array<[string, ReactNode]> = [
    ['Event', `#${row.id}`],
    ['Time', row.at],
    ['Actor', `${actorLabel(row)} (${ACTOR_TYPE_WORD[row.actorType]})`],
    ['Request ID', row.requestId ?? '-'],
    ['Policy version', row.policyVersion === null ? '-' : `v${row.policyVersion}`],
    ['Hash', row.hash],
  ];
  return (
    <Box
      data-ui="section"
      sx={(t) => ({
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        p: 4,
        borderRadius: '12px',
        backgroundColor: m3(t).cardNested,
        minWidth: 0,
      })}
    >
      <Box
        component="dl"
        sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 1, columnGap: 4 }}
      >
        {facts.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}
      >
        <Summary label="Before" value={row.before} />
        <Summary label="After" value={row.after} />
      </Box>
    </Box>
  );
}

const COLUMNS: Array<DataColumn<AuditRow>> = [
  { key: 'id', header: 'Event', width: '12%', render: (row) => `#${row.id}` },
  { key: 'at', header: 'Time', width: '16%', render: (row) => <Time iso={row.at} /> },
  { key: 'actor', header: 'Actor', width: '20%', render: (row) => actorLabel(row) },
  { key: 'action', header: 'Action', width: '22%', render: (row) => row.action },
  { key: 'entity', header: 'Entity', render: (row) => `${row.entityType} ${row.entityId}` },
];

function EventListItem({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  return (
    <Box
      component="li"
      data-ui="section"
      sx={(t) => ({
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        px: 4,
        py: 3,
        borderRadius: '12px',
        backgroundColor: m3(t).card,
        minWidth: 0,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" component="p" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
            {row.action}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
            #{row.id}, {actorLabel(row)}, {row.entityType} {row.entityId}, <Time iso={row.at} />
          </Typography>
        </Box>
        <IconButton
          label={`Details of event #${row.id}`}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </IconButton>
      </Box>
      {open ? (
        <Box id={detailId}>
          <EventDetails row={row} />
        </Box>
      ) : null}
    </Box>
  );
}

function Filters({ filters, onChange }: { filters: AuditFilters; onChange: (next: AuditFilters) => void }) {
  const dateError = rangeError(filters);
  const set = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K] | '') =>
    onChange({ ...filters, [key]: value || undefined });
  const field = { flex: '1 1 160px', minWidth: 0, maxWidth: { sm: 240 } } as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box
        role="group"
        aria-label="Actor"
        sx={{ display: 'flex', flexWrap: { xs: 'nowrap', sm: 'wrap' }, gap: 2, overflowX: 'auto', pb: 1 }}
      >
        {ACTOR_CHIPS.map((chip) => (
          <FilterChip
            key={chip.value}
            label={chip.label}
            selected={filters.actorType === chip.value}
            aria-pressed={filters.actorType === chip.value}
            onClick={() => set('actorType', filters.actorType === chip.value ? undefined : chip.value)}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' }}>
        <TextField
          select
          label="Action"
          value={filters.action ?? ''}
          onChange={(event) => set('action', event.target.value)}
          sx={field}
        >
          <MenuItem value="">Any action</MenuItem>
          {AUDIT_ACTIONS.map((action) => (
            <MenuItem key={action} value={action}>
              {action}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Entity"
          value={filters.entity ?? ''}
          onChange={(event) => set('entity', event.target.value)}
          sx={field}
        >
          <MenuItem value="">Any entity</MenuItem>
          {AUDIT_ENTITIES.map((entity) => (
            <MenuItem key={entity} value={entity}>
              {entity}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          label="From"
          value={filters.from ?? ''}
          onChange={(event) => set('from', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={field}
        />
        <TextField
          type="date"
          label="To"
          value={filters.to ?? ''}
          onChange={(event) => set('to', event.target.value)}
          error={Boolean(dateError)}
          helperText={dateError ?? undefined}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={field}
        />
      </Box>
    </Box>
  );
}

export function AuditView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = useMemo(() => parseAuditFilters(searchParams), [searchParams]);
  // An inverted date range stays in the fields (typed input is never lost) but is not sent to the API.
  const sent = useMemo(() => (rangeError(filters) ? { ...filters, to: undefined } : filters), [filters]);
  const events = useAuditEvents(sent);

  const setFilters = useCallback(
    (next: AuditFilters) => router.replace(`${pathname}${auditSearch(next)}`, { scroll: false }),
    [pathname, router],
  );
  const onSearch = useCallback((q: string) => setFilters({ ...filters, q: q || undefined }), [filters, setFilters]);
  const clear = () => setFilters({});

  const loaded = events.data?.pages.flatMap((page) => page.items) ?? [];
  const total = events.data?.pages[0]?.total ?? 0;

  return (
    <Box sx={{ px: { xs: 4, sm: 6 }, py: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <Typography variant="h1">Audit</Typography>
      <IntegrityBanner onShowEvent={(id) => setFilters({ q: `#${id}` })} />

      <Card component="section" aria-label="Filters" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SearchBar
          value={filters.q ?? ''}
          onSearch={onSearch}
          label="Search the audit trail"
          placeholder="Search actor, entity, request ID or #event"
        />
        <Filters filters={filters} onChange={setFilters} />
        {hasAuditFilters(filters) ? (
          <Box>
            <Button variant="text" startIcon={<FilterAltOffRounded />} onClick={clear} sx={{ ml: -3 }}>
              Clear filters
            </Button>
          </Box>
        ) : null}
      </Card>

      <Box
        component="section"
        aria-label="Events"
        sx={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
      >
        <QueryState
          query={events}
          loadingLabel="Loading audit events"
          isEmpty={(data) => (data.pages[0]?.items.length ?? 0) === 0}
          empty={
            <Card>
              {hasAuditFilters(filters) ? (
                <EmptyState
                  icon={<FilterAltOffRounded />}
                  title={filters.q ? `No events match '${filters.q}'.` : 'No events match these filters.'}
                  action={
                    <Button variant="tonal" onClick={clear}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<HistoryRounded />}
                  title="No audit events yet."
                  description="Posts, reports, analyses and decisions are recorded here as they happen."
                />
              )}
            </Card>
          }
        >
          {() => (
            <>
              <Card sx={{ display: { xs: 'none', md: 'block' }, p: { md: 2 } }}>
                <DataTable
                  caption="Audit events, newest first"
                  columns={COLUMNS}
                  rows={loaded}
                  rowKey={(row) => row.id}
                  renderExpanded={(row) => <EventDetails row={row} />}
                  expandLabel={(row) => `Details of event #${row.id}`}
                />
              </Card>
              <Box
                component="ul"
                aria-label="Audit events, newest first"
                sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1, m: 0, p: 0 }}
              >
                {loaded.map((row) => (
                  <EventListItem key={row.id} row={row} />
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
                {events.hasNextPage ? (
                  <Button
                    variant="tonal"
                    loading={events.isFetchingNextPage}
                    onClick={() => void events.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : null}
              </Box>
            </>
          )}
        </QueryState>
      </Box>
    </Box>
  );
}
