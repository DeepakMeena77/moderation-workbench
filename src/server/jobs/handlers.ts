import type { JobType } from '@prisma/client';
import { analyzePayloadSchema, runAnalysis } from '../services/analysis';
import type { ClaimedJob } from './queue';

// One handler per job type (docs/02-system-design.md sec. 6). A thrown error is an infrastructure failure:
// the runner re-queues the job with back-off and fails it after maxAttempts. (From S3, an AI failure is a
// successful job with a degraded analysis, not a thrown error.)

export type JobHandler = (job: ClaimedJob) => Promise<void>;

export const HANDLERS: Record<JobType, JobHandler> = {
  analyze: async (job) => {
    await runAnalysis(analyzePayloadSchema.parse(job.payload));
  },
  appeal_brief: async () => {
    throw new Error('appeal_brief jobs have no handler before S5.');
  },
};
