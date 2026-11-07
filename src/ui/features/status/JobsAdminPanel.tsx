'use client';

import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Me } from '../../api/hooks';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { useSnackbar } from '../../components/SnackbarProvider';
import { layout, m3 } from '../../theme/theme';
import { shortDateTime } from '../feed/format';

// Admin controls on /status (03 sec. 6.12, OPS-4): Process pending jobs, and Retry for each failed job. Shapes
// mirror src/server/services/jobs.ts and jobs/runner.ts (the UI may not import server code, docs/02 sec. 2).
// The role is read on the client, so /status itself never waits for the database.

interface RunSummary {
  claimed: number;
  succeeded: number;
  requeued: number;
  failed: number;
  exhausted: number;
}

interface FailedJob {
  id: string;
  type: 'analyze' | 'appeal_brief';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  failedAt: string;
  caseId: string | null;
}

const JOB_TYPE: Record<FailedJob['type'], string> = { analyze: 'Analysis', appeal_brief: 'Appeal summary' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Processed 3 jobs: 2 succeeded, 1 will be retried." */
export function runSummaryText(s: RunSummary): string {
  if (s.claimed === 0 && s.exhausted === 0) return 'No jobs were waiting.';
  const parts = [`${s.succeeded} succeeded`];
  if (s.requeued > 0) parts.push(`${s.requeued} will be retried`);
  if (s.failed + s.exhausted > 0) parts.push(`${s.failed + s.exhausted} failed`);
  return `Processed ${plural(s.claimed, 'job')}: ${parts.join(', ')}.`;
}

function useIsAdmin(signedIn: boolean): boolean {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: Me }>('/api/auth/me'),
    enabled: signedIn,
    retry: false,
  });
  return me.data?.user.role === 'admin';
}

function FailedJobRow({ job }: { job: FailedJob }) {
  const queryClient = useQueryClient();
  const notify = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const retry = useMutation({
    mutationFn: () => api.post<{ id: string; status: 'queued' }>(`/api/jobs/${encodeURIComponent(job.id)}/retry`),
    onSuccess: () => {
      setError(null);
      notify(`${JOB_TYPE[job.type]} job queued again.`);
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'failed'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't retry this job. Try again."),
  });
  return (
    <Box
      component="li"
      data-ui="section"
      sx={(t) => ({
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 4,
        borderRadius: `${layout.controlRadius}px`,
        border: `1px solid ${m3(t).border}`,
        backgroundColor: m3(t).cardNested,
        minWidth: 0,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {JOB_TYPE[job.type]} job
            {job.caseId ? `, case ${job.caseId}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            Failed after {plural(job.attempts, 'attempt')},{' '}
            <time dateTime={job.failedAt} title={job.failedAt}>
              {shortDateTime(job.failedAt)}
            </time>
          </Typography>
        </Box>
        <Button
          variant="secondary"
          startIcon={<ReplayRounded />}
          loading={retry.isPending}
          onClick={() => retry.mutate()}
        >
          Retry
        </Button>
      </Box>
      {job.lastError ? (
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          Last error: {job.lastError}
        </Typography>
      ) : null}
      {error ? (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      ) : null}
    </Box>
  );
}

function Panel() {
  const queryClient = useQueryClient();
  const notify = useSnackbar();
  const [error, setError] = useState<string | null>(null);
  const failed = useQuery({
    queryKey: ['jobs', 'failed'],
    queryFn: () => api.get<{ items: FailedJob[]; total: number }>('/api/jobs/failed'),
  });
  const run = useMutation({
    mutationFn: () => api.post<RunSummary>('/api/jobs/run'),
    onSuccess: (summary) => {
      setError(null);
      notify(runSummaryText(summary));
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'failed'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't process the jobs. Try again."),
  });

  return (
    <Card
      component="section"
      aria-labelledby="jobs-admin-title"
      sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 3 }}>
        <Box>
          <Typography id="jobs-admin-title" variant="h3" component="h2">
            Background jobs (admin)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Jobs also run after each request that queues work. Use this when something is waiting.
          </Typography>
        </Box>
        <Button startIcon={<PlayArrowRounded />} loading={run.isPending} onClick={() => run.mutate()}>
          Process pending jobs
        </Button>
      </Box>
      {error ? (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      ) : null}
      <Typography variant="h4" component="h3">
        Failed jobs
      </Typography>
      <QueryState
        query={failed}
        loadingLabel="Loading failed jobs"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <Typography variant="body2" color="text.secondary">
            No failed jobs. Jobs that fail three times appear here with a Retry button.
          </Typography>
        }
      >
        {(data) => (
          <>
            <Box
              component="ul"
              aria-label="Failed jobs"
              sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {data.items.map((job) => (
                <FailedJobRow key={job.id} job={job} />
              ))}
            </Box>
            {data.total > data.items.length ? (
              <Typography variant="caption" color="text.secondary" component="p">
                Showing the {data.items.length} most recent of {data.total} failed jobs.
              </Typography>
            ) : null}
          </>
        )}
      </QueryState>
    </Card>
  );
}

export function JobsAdminPanel({ signedIn }: { signedIn: boolean }) {
  return useIsAdmin(signedIn) ? <Panel /> : null;
}
