import type { Severity } from '../ai/types';

// Q-2: queue priority from 0 to 100. An alwaysEscalate clause pins it to 100; everything else stays at or below 99.

export const SEVERITY_BASE: Readonly<Record<Severity | 'none', number>> = {
  none: 10,
  low: 25,
  medium: 50,
  high: 75,
};

export interface PriorityInput {
  /** The highest severity over all findings; null when there are none. */
  severity: Severity | null;
  reportCount: number;
  needsHuman: boolean;
  alwaysEscalate: boolean;
}

export function computePriority(input: PriorityInput): number {
  if (input.alwaysEscalate) return 100;
  const base = SEVERITY_BASE[input.severity ?? 'none'];
  const reports = Math.min(10 * Math.max(0, input.reportCount), 30);
  return Math.min(99, base + reports + (input.needsHuman ? 5 : 0));
}
