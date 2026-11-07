import { createHash } from 'node:crypto';
import { z } from 'zod';

// Policy file contract (docs/02-system-design.md sec. 4, POL-1). Pure: no config or database imports, so
// prisma/seed.ts can use it. Unknown keys are errors, not silently dropped, so a typo in a pasted policy
// ("keyword" for "keywords") is reported with its path instead of quietly disabling a signal.

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export const MOD_ACTIONS = ['none', 'label', 'limit', 'remove'] as const; // ordered by strength
export const CLAUSE_ACTIONS = ['label', 'limit', 'remove'] as const;

export type Severity = (typeof SEVERITIES)[number];
export type ModAction = (typeof MOD_ACTIONS)[number];

/** Flags every policy regex is compiled with, here (validation) and in src/server/rules. */
export const POLICY_REGEX_FLAGS = 'gi';

const regexSource = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (source) => {
      try {
        new RegExp(source, POLICY_REGEX_FLAGS);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Not a valid regular expression.' },
  );

const signalsSchema = z
  .object({
    keywords: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    patterns: z.array(regexSource).max(50).optional(),
    linkThreshold: z.number().int().min(1).max(50).optional(),
    contactDetails: z.boolean().optional(),
    addressPattern: regexSource.optional(),
  })
  .strict();

export const clauseSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2,6}-\d{1,3}$/, 'Use a code like HAR-1.'),
    title: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(2000),
    defaultSeverity: z.enum(SEVERITIES),
    defaultAction: z.enum(CLAUSE_ACTIONS),
    allowedActions: z.array(z.enum(CLAUSE_ACTIONS)).min(1).max(3),
    signals: signalsSchema.default({}),
    alwaysEscalate: z.boolean().default(false),
  })
  .strict()
  .refine((clause) => clause.allowedActions.includes(clause.defaultAction), {
    message: 'defaultAction must be one of allowedActions.',
    path: ['defaultAction'],
  });

export const policyFileSchema = z
  .object({
    // Ignored on publish: the server assigns the next version (02 sec. 6). Optional so a paste may omit it.
    version: z.number().int().positive().optional(),
    notes: z.string().trim().max(500).optional(),
    clauses: z.array(clauseSchema).min(1).max(50),
  })
  .strict()
  .superRefine((policy, ctx) => {
    const seen = new Set<string>();
    policy.clauses.forEach((clause, index) => {
      if (seen.has(clause.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clauses', index, 'code'],
          message: `Duplicate clause code ${clause.code}.`,
        });
      }
      seen.add(clause.code);
    });
  });

export type Clause = z.infer<typeof clauseSchema>;
export type PolicyFile = z.infer<typeof policyFileSchema>;

/** A policy as the rest of the server uses it: the version it was published as and its clauses. */
export interface ActivePolicy {
  version: number;
  clauses: Clause[];
}

export const clausesSchema = z.array(clauseSchema);

/** JSON with object keys sorted at every level, so equal content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The identity of a policy's content: its clauses only. The version number and notes are left out, so
 * re-publishing identical clauses is detected as POLICY_UNCHANGED (S6) whatever version the paste claims.
 */
export function policyContentHash(clauses: Clause[]): string {
  return createHash('sha256').update(canonicalJson(clauses), 'utf8').digest('hex');
}

const ACTION_RANK: Record<ModAction, number> = { none: 0, label: 1, limit: 2, remove: 3 };
const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

export function strongerAction(a: ModAction, b: ModAction): ModAction {
  return ACTION_RANK[b] > ACTION_RANK[a] ? b : a;
}

export function higherSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (a === null) return b;
  if (b === null) return a;
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}
