'use client';

import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { QueryState } from '../../components/QueryState';
import { CardSkeleton } from '../../components/Skeletons';
import { useSnackbar } from '../../components/SnackbarProvider';
import { Tag } from '../../components/Tag';
import { useReevaluationRun, useRetryFailed, type ReevaluationRun } from './api';

// The re-evaluation progress card (03 sec. 6.9, POL-3): linear progress, done and failed counts, and Retry failed.
// It polls the run every 2 s while it is running; each poll also kicks the job runner on the server.

function stateTag(run: ReevaluationRun) {
  if (run.state === 'running') return <Tag label="Running" tone="info" />;
  if (run.state === 'finished') return <Tag label="Finished" tone="success" />;
  return <Tag label="Finished with failures" tone="error" />;
}

function RunBody({ run, canRetry }: { run: ReevaluationRun; canRetry: boolean }) {
  const retry = useRetryFailed(run.id);
  const notify = useSnackbar();
  const processed = run.done + run.failed;
  const percent = run.total === 0 ? 100 : Math.round((processed / run.total) * 100);

  return (
    <Box data-ui="stack" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Typography variant="h2" component="h2" sx={{ flex: '1 1 auto', overflowWrap: 'anywhere' }}>
          Re-evaluation v{run.fromVersion} {'->'} v{run.toVersion}
        </Typography>
        {stateTag(run)}
      </Box>
      <LinearProgress
        variant="determinate"
        value={percent}
        aria-label={`Re-evaluation progress, ${processed} of ${run.total} cases`}
        color={run.failed > 0 ? 'error' : 'primary'}
        sx={{ height: 4, borderRadius: '2px' }}
      />
      <Typography variant="body2" aria-live="polite">
        {run.total === 0
          ? 'No unresolved cases needed re-analysis.'
          : `${run.done} of ${run.total} re-analysed, ${run.failed} failed.`}
      </Typography>
      {run.failed > 0 && canRetry ? (
        <Box>
          <Button
            variant="secondary"
            loading={retry.isPending}
            onClick={() =>
              retry.mutate(undefined, {
                onSuccess: (result) =>
                  notify(`${result.retried} failed ${result.retried === 1 ? 'case is' : 'cases are'} queued again.`),
                onError: (error) =>
                  notify(error instanceof ApiError ? error.message : "Couldn't retry the failed cases. Try again."),
              })
            }
          >
            Retry failed
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

export function ReevaluationProgress({ runId, canRetry }: { runId: string; canRetry: boolean }) {
  const run = useReevaluationRun(runId);
  return (
    <Card component="section" aria-label="Re-evaluation progress">
      <QueryState query={run} loadingLabel="Loading re-evaluation progress" skeleton={<CardSkeleton height={96} />}>
        {(data) => <RunBody run={data} canRetry={canRetry} />}
      </QueryState>
    </Card>
  );
}
