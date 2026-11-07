import type { AiStatus, CaseStatus, ModAction, Severity } from '../api/hooks';
import { DotLabel, Tag, type DotTone, type TagTone } from './Tag';

// The moderation labels of 03 sec. 2.2. Severity is a dot plus a word; actions, versions and clause codes are
// neutral badges; a hue appears only where it means something (needs review, auto-cleared, an AI failure,
// insufficient context). Colour is never the only signal: every label is text.

const SEVERITY_WORD: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function SeverityTag({ severity, size = 'small' }: { severity: Severity | null; size?: 'small' | 'body' }) {
  if (!severity)
    return (
      <DotLabel tone="low" size={size}>
        No severity
      </DotLabel>
    );
  const tone: DotTone = severity;
  return (
    <DotLabel tone={tone} size={size}>
      {SEVERITY_WORD[severity]} severity
    </DotLabel>
  );
}

export const ACTION_LABEL: Record<ModAction, string> = {
  none: 'No action',
  label: 'Label',
  limit: 'Limit',
  remove: 'Remove',
};

/** Every action is the same neutral badge: the word carries the meaning. */
export function ActionTag({ action }: { action: ModAction }) {
  return <Tag label={ACTION_LABEL[action]} />;
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  pending_analysis: 'Analysing...',
  awaiting_review: 'Needs review',
  auto_cleared: 'Auto-cleared',
  resolved: 'Resolved',
  appealed: 'Appealed',
  appeal_resolved: 'Appeal resolved',
};

const STATUS_TONE: Record<CaseStatus, TagTone> = {
  pending_analysis: 'neutral',
  awaiting_review: 'info',
  auto_cleared: 'success',
  resolved: 'neutral',
  appealed: 'neutral',
  appeal_resolved: 'neutral',
};

export function StatusTag({ status }: { status: CaseStatus }) {
  return <Tag label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export const AI_STATUS_LABEL: Record<AiStatus, string> = {
  ok: 'AI reviewed',
  timeout: 'AI timed out',
  rate_limited: 'AI rate-limited',
  invalid_output: 'AI output invalid',
  invalid_input: 'AI input too large',
  provider_error: 'AI provider error',
  budget_exhausted: 'AI budget reached',
  unavailable: 'AI unavailable',
};

export function AiStateTag({ status, fallbackUsed = false }: { status: AiStatus; fallbackUsed?: boolean }) {
  if (status === 'ok' && fallbackUsed) return <Tag label="AI fallback model" />;
  if (status === 'ok') return <Tag label={AI_STATUS_LABEL.ok} />;
  return <Tag label={AI_STATUS_LABEL[status]} tone="error" />;
}

export function InsufficientContextTag() {
  return <Tag label="Insufficient context" tone="warning" />;
}

export function PolicyVersionTag({ version }: { version: number }) {
  return <Tag label={`Policy v${version}`} />;
}

export function ClauseTag({ code, title }: { code: string; title?: string }) {
  return <Tag label={code} mono title={title} />;
}

export function EvidenceTag({ kind }: { kind: 'rule' | 'confirmed' | 'interpretation' }) {
  if (kind === 'rule') return <Tag label="Rule match" />;
  if (kind === 'confirmed') return <Tag label="AI, quote verified" tone="info" />;
  return <Tag label="AI interpretation" />;
}
