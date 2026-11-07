import { canonicalJson, type Clause } from './schema';

// policyDiff(a, b) (docs/02-system-design.md sec. 4, POL-5): which clauses were added, removed or changed between
// two policy versions, field by field. Pure, so the compare page, the publish preview and the tests share it.

/** A clause field whose value differs; nested objects (signals) are compared one key deeper. */
export interface FieldChange {
  /** "title", "allowedActions" or a dotted signal key such as "signals.linkThreshold". */
  field: string;
  before: unknown;
  after: unknown;
}

export interface ClauseChange {
  code: string;
  title: string;
  changes: FieldChange[];
}

export interface PolicyDiff {
  added: Clause[];
  removed: Clause[];
  changed: ClauseChange[];
  unchanged: string[];
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldChanges(before: Clause, after: Clause): FieldChange[] {
  const changes: FieldChange[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    if (same(a, b)) continue;
    // Signals hold several independent settings; reporting "signals changed" would hide which one did.
    if (key === 'signals' && (isRecord(a) || a === undefined) && (isRecord(b) || b === undefined)) {
      const left = a ?? {};
      const right = b ?? {};
      const signalKeys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const signal of signalKeys) {
        if (!same(left[signal], right[signal])) {
          changes.push({ field: `signals.${signal}`, before: left[signal] ?? null, after: right[signal] ?? null });
        }
      }
      continue;
    }
    changes.push({ field: key, before: a ?? null, after: b ?? null });
  }
  return changes;
}

/** Clauses are matched by code. Order follows `b` for added and changed clauses, `a` for removed ones. */
export function policyDiff(a: readonly Clause[], b: readonly Clause[]): PolicyDiff {
  const before = new Map(a.map((clause) => [clause.code, clause]));
  const after = new Map(b.map((clause) => [clause.code, clause]));
  const diff: PolicyDiff = { added: [], removed: [], changed: [], unchanged: [] };
  for (const clause of b) {
    const old = before.get(clause.code);
    if (!old) {
      diff.added.push(clause);
      continue;
    }
    const changes = fieldChanges(old, clause);
    if (changes.length === 0) diff.unchanged.push(clause.code);
    else diff.changed.push({ code: clause.code, title: clause.title, changes });
  }
  for (const clause of a) {
    if (!after.has(clause.code)) diff.removed.push(clause);
  }
  return diff;
}

export function isEmptyDiff(diff: PolicyDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

export interface PolicyChange {
  fromVersion: number;
  toVersion: number;
  message: string;
}

/**
 * POL-4: a resolved decision keeps its policy version. When a newer version is active, its history says so.
 * Returns null while the decision's version is still the active one.
 */
export function policyChangeSince(decisionVersion: number, activeVersion: number): PolicyChange | null {
  if (activeVersion <= decisionVersion) return null;
  return {
    fromVersion: decisionVersion,
    toVersion: activeVersion,
    message: `Policy changed since this decision (v${decisionVersion} -> v${activeVersion})`,
  };
}
