import { z } from 'zod';
import { MOD_ACTIONS, SEVERITIES } from './types';

// Output contract of the classify prompt (docs/02-system-design.md sec. 5.2). HUM-1 / AI-12: there is no field that
// can approve, remove, decide or set a status. z.object strips unknown keys, so a model that adds one changes
// nothing downstream.

export const MAX_FINDINGS = 8;
export const MAX_QUOTES = 3;

const reason = z.string().trim().min(1).max(500);

export const aiFindingSchema = z.object({
  clauseCode: z.string().trim().min(1).max(32),
  evidenceType: z.enum(['confirmed', 'interpretation']),
  quotes: z.array(z.string().min(1).max(500)).max(MAX_QUOTES),
  interpretation: z.string().trim().max(1000),
  severity: z.enum(SEVERITIES),
  severityReason: reason,
  confidence: z.number().min(0).max(1),
  confidenceReason: reason,
});

export const classifyOutputSchema = z.object({
  findings: z.array(aiFindingSchema).max(MAX_FINDINGS),
  proposedAction: z.enum(MOD_ACTIONS),
  overallSeverity: z.enum(SEVERITIES),
  overallConfidence: z.number().min(0).max(1),
  confidenceReason: reason,
  needsHumanReview: z.boolean(),
  humanReviewReasons: z.array(z.string().trim().min(1).max(300)).max(10),
  insufficientContext: z.boolean(),
});

export type AiFinding = z.infer<typeof aiFindingSchema>;
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;

/** Zod issues as `path: message` lines. The repair call sends these back to the model verbatim. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`);
}

// The same contract as JSON Schema for Gemini JSON mode. Hand-written (no extra dependency); a unit test keeps the
// keys in step with the Zod schema.
const str = (maxLength: number) => ({ type: 'string', maxLength });
const unit = { type: 'number', minimum: 0, maximum: 1 };

export const classifyResponseJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      maxItems: MAX_FINDINGS,
      items: {
        type: 'object',
        properties: {
          clauseCode: str(32),
          evidenceType: { type: 'string', enum: ['confirmed', 'interpretation'] },
          quotes: { type: 'array', maxItems: MAX_QUOTES, items: str(500) },
          interpretation: str(1000),
          severity: { type: 'string', enum: [...SEVERITIES] },
          severityReason: str(500),
          confidence: unit,
          confidenceReason: str(500),
        },
        required: [
          'clauseCode',
          'evidenceType',
          'quotes',
          'interpretation',
          'severity',
          'severityReason',
          'confidence',
          'confidenceReason',
        ],
      },
    },
    proposedAction: { type: 'string', enum: [...MOD_ACTIONS] },
    overallSeverity: { type: 'string', enum: [...SEVERITIES] },
    overallConfidence: unit,
    confidenceReason: str(500),
    needsHumanReview: { type: 'boolean' },
    humanReviewReasons: { type: 'array', maxItems: 10, items: str(300) },
    insufficientContext: { type: 'boolean' },
  },
  required: [
    'findings',
    'proposedAction',
    'overallSeverity',
    'overallConfidence',
    'confidenceReason',
    'needsHumanReview',
    'humanReviewReasons',
    'insufficientContext',
  ],
};
