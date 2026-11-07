import type { Severity } from '../policy/schema';

// Queue priority 0-100 (Q-2): any alwaysEscalate clause gives 100; otherwise
// min(99, base(severity) + min(10 * reports, 30) + (needsHuman ? 5 : 0)).

const BASE: Record<Severity | 'none', number> = { none: 10, low: 25, medium: 50, high: 75 };

export interface PriorityInput {
  severity: Severity | null;
  reportCount: number;
  needsHuman: boolean;
  alwaysEscalate: boolean;
}

export function computePriority({ severity, reportCount, needsHuman, alwaysEscalate }: PriorityInput): number {
  if (alwaysEscalate) return 100;
  const reports = Math.min(10 * Math.max(0, reportCount), 30);
  return Math.min(99, BASE[severity ?? 'none'] + reports + (needsHuman ? 5 : 0));
}
